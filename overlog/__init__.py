import os
import sys
import time
import json
import pprint
import inspect
import logging
import traceback

import zmq


MAX_STRDUMP=100

class RCP3Client(object):
	def __init__(self):
		pass

	def Connect(self, address):
		self._context = zmq.Context()
		self._socket = self._context.socket(zmq.PUB)
		self._socket.connect(address)

	def SendMessage(self, value, streamName=None, commands=None):
		form = {
			'__type': 3
		}

		if self._socket == None:
			raise Exception("Attempt to send message without connection.")

		additionalInfo = dict()
		additionalInfo["TimeStamp"] = int(time.time()*1000)
		additionalInfo["ProcessingSequence"] = "_Overlog"
		additionalInfo["DataType"] = "JSON"
		if commands!=None: additionalInfo["Commands"] = commands

		json_val = json.dumps(value)
		message = "%s%c%s%c%s"%(streamName, chr(0), json.dumps(additionalInfo), chr(0), json_val)

		#print 'sending', message
		self._socket.send(message)


class Dumper(object):
	'Converts any Python thing into a JSON-compatible object'
	# TODO: for objects, converting to dict is not enough, need at least type

	def dump(self, obj):
		self.seen = set()
		res = self.convert_obj(obj)
		self.seen = set()
		return res

	def convert_obj(self, obj, depth=4):
		if id(obj) in self.seen: return u'<object "{}" already seen before>'.format(unicode(obj)[:MAX_STRDUMP])
		self.seen.add(id(obj))

		prim = (int, long, float, str, unicode)
		composite = (list, dict, tuple, set)
		if isinstance(obj, prim): return obj

		if isinstance(obj, list) or isinstance(obj, tuple) or isinstance(obj, set):
			return [self.convert_obj(x, depth-1) for x in obj]
		if isinstance(obj, dict):
			return {self.stringize(k): self.convert_obj(obj[k], depth-1) for k in obj if self.attr_filter(k, obj[k])}

		# at this stage we only have custom types
		dump = getattr(obj, '__dump__', None)
		if dump:
			res = dump()
		else:
			res = self.std_dump(obj)

		return self.convert_obj(res, depth-1)

	def stringize(self, x):
		if isinstance(x, unicode): return x
		elif isinstance(x, str): return x
		else: return unicode(x)

	def std_dump(self, obj):
		return {k: getattr(obj, k)     for k in dir(obj)}

	def attr_filter(self, k, v):
		if inspect.ismodule(v) or inspect.ismethod(v) or inspect.isfunction(v): return False
		if inspect.isgenerator(v) or inspect.isbuiltin(v) or inspect.isroutine(v): return False
		if isinstance(k, (str, unicode)):
			if k.startswith('__') and k.endswith('__'): return False
		return True

	def dump_function(self, obj):
		return {'name': obj.func_name,
				'filename': obj.func_code.co_filename,
				'lineno': obj.func_code.co_firstlineno}

	def dump_stackframe(self, obj):
		'Compatible with dump_function'
		return {'name': obj[2],
				'filename': obj[0],
				'lineno': obj[1]}


class Logger(object):
	def __init__(self):
		self.rc = RCP3Client()
		self.rc.Connect("tcp://localhost:55557")

	def data(self, *args, **kwargs):
		data = self.pack_args(*args, **kwargs)
		data['caller'] = Dumper().dump_stackframe( traceback.extract_stack(limit=3)[1] )
		self.send_data(data)

	def pack_args(self, *args, **kwargs):
		data = {}

		for ix, i in enumerate(args):
			data['arg{}'.format(ix)] = i
		for k in kwargs:
			data['kwarg_'+k] = kwargs[k]

		return data


	def send_data(self, data, **kwargs):
		try:
			msg = {'time': time.time(),
				'pid': os.getpid(),
				'stack': self.filter_stack( traceback.extract_stack() ),
				'data': Dumper().dump(data)}
			msg.update(kwargs)

			self.handle_msg(msg)
		except Exception as e:
			logging.exception('in overlog, ignoring')

	def filter_stack(self, stack):
		def pred(fname, lineno, function, codeline):
			return ((codeline.find('extract_stack()') != -1) and (fname.find('overlog') != -1))
		if pred(*stack[-1]): return stack[:-1]
		return stack

	def handle_msg(self, msg):
		self.rc.SendMessage(msg, 'OverLog#')

	# decorator
	def method(self, fn):
		# TODO: should define some metadata about messages
		def _internal(_self, *args, **kwargs):
			data = self.pack_args(*args, **kwargs)
			data['caller'] = Dumper().dump_function(fn)
			self.send_data(data, func_name=fn.func_name)
			return fn(_self, *args, **kwargs)

		return _internal


	# decorator
	def classy(self, cls):
		return cls

	def loc(self, loc):
		self.send_data(loc)

OLOG = Logger()

class SomeClass(object):
	def __init__(self):
		self.a = 1
		self.b = 'cc'
		self.sel = self

	def x__dump__(self):
		return [self.a, self.b]

	@OLOG.method
	def method(self, x):
		print 3 + x


	def test(self):
		OLOG.data('hello')

TESTDATA = [1, 'abc', u'bcd', SomeClass()]

if __name__ == '__main__':
	x = SomeClass()
	x.method(4)
	x.test()
