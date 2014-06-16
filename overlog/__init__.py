import os
import re
import sys
import time
import json
import pprint
import inspect
import logging
import traceback

import zmq


MAX_STRDUMP=100
HAS_UTF8 = re.compile(r'[\x80-\xff]')

def has_utf8(s): return HAS_UTF8.search(s) is not None

def ByteToHex( byteStr ):
	""" Convert a byte string to it's hex string representation e.g. for output.  """
	return ''.join( [ "%02X" % ord( x ) for x in byteStr ] ).strip()


class RCP3Client(object):
	def __init__(self):
		pass

	def Connect(self, address):
		self._context = zmq.Context()
		self._socket = self._context.socket(zmq.PUB)
		self._socket.connect(address)

	def SendMessage(self, value, streamName=None, commands=None):
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
		print 'msg {} being sent in overlog.client'.format(additionalInfo['TimeStamp'])
		self._socket.send(message)


class Dumper(object):
	'Converts any Python thing into a JSON-compatible object'
	# TODO: for objects, converting to dict is not enough, need at least type

	def dump(self, obj):
		self.seen = set()
		res = self.convert_obj(obj)
		self.seen = set()
		return res

	def handle_binary(self, obj):
		if isinstance(obj, str) and has_utf8(obj):
			return '>>' + ByteToHex(obj) + '<<'
		return obj

	def print_seen(self, obj):
		try:
			return u'<object "{}" already seen before>'.format(unicode(
				self.handle_binary(obj))[:MAX_STRDUMP])
		except:
			return u'<object repr:"{}" already seen before>'.format(repr(obj)[:MAX_STRDUMP])

	def convert_obj(self, obj, depth=4):
		if depth == 0: return ''
		if id(obj) in self.seen:
			return self.print_seen(obj)

		self.seen.add(id(obj))

		prim = (int, long, float, str, unicode)
		composite = (list, dict, tuple, set)
		obj = self.handle_binary(obj)
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
		result = {}
		for k in dir(obj):
			try:
				result[k] = getattr(obj, k)
			except: pass
		return result

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
		caller = Dumper().dump_stackframe( traceback.extract_stack(limit=3)[1] )
		self.send_data(data, caller=caller)

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

			# add hash for caller
			self.hash_caller(msg)

			self.handle_msg(msg)
		except Exception as e:
			logging.exception('in overlog, ignoring')

	def hash_caller(self, msg):
		if not 'caller' in msg: return

		msg['caller']['hash'] = hash((msg['caller']['name'],
									msg['caller']['filename'],
									msg['caller']['lineno']))

	def filter_stack(self, stack):
		def pred(fname, lineno, function, codeline):
			return ((codeline.find('extract_stack()') != -1) and (fname.find('overlog') != -1))
		if pred(*stack[-1]): return stack[:-1]
		return stack

	def handle_msg(self, msg):
		self.rc.SendMessage(msg, 'OverLog#')

	def trace_fmt(self):
		sys.setprofile(self.tracer)

	def tracer(self, frame, event, arg):
		if event != 'c_call' or arg.__name__ != 'format' or not isinstance(arg.__self__, (str, unicode)): return
		if frame.f_code.co_filename == __file__: return
		#print frame.f_locals
		data = frame.f_locals
		caller = {'name': frame.f_code.co_name,
					'filename': frame.f_code.co_filename,
					'lineno': frame.f_lineno}
		self.send_data(data, caller=caller)




	# decorator
	def method(self, fn):
		# TODO: should define some metadata about messages
		def _internal(_self, *args, **kwargs):
			data = self.pack_args(*args, **kwargs)
			caller = Dumper().dump_function(fn)
			self.send_data(data, func_name=fn.func_name, caller=caller)
			return fn(_self, *args, **kwargs)

		return _internal


	# decorator
	def classy(self, cls):
		return cls

	def loc(self, loc):
		caller = Dumper().dump_stackframe( traceback.extract_stack(limit=3)[1] )
		self.send_data(loc, caller=caller)


