import os
import re
import sys
import time
import json
import pprint
import inspect
import logging
import traceback
import threading

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

		json_val = json.dumps(value)
		print 'msg {} being sent in overlog.client'.format(time.time())
		self._socket.send(json_val)


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
		if depth == 0: return '<too deep>'
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
		self.rc.Connect("tcp://localhost:5111")
		# use when it's not necessary to re-create Dumper
		self.dmp = Dumper()


	def data(self, *args, **kwargs):
		data = self.pack_args(*args, **kwargs)
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
			thr = threading.current_thread()
			msg = {'time': time.time(),
				'pid': os.getpid(),
				'stack': self.filter_stack( traceback.extract_stack() ),
				'data': Dumper().dump(data),
				'thread': {
					'id': thr.ident,
					'name': thr.name
				}
			}
			msg.update(kwargs)

			if not ('caller' in kwargs):
				msg['caller'] = self.dmp.dump_stackframe(msg['stack'][-1])

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
		def is_overlog(fname, lineno, function, codeline):
			res = ((fname.replace('\\', '/').find('overlog/__init__.py') != -1))
			return res

		cutoff = 1
		while cutoff < len(stack):
			if not is_overlog(*stack[-cutoff]): break
			cutoff += 1
		return stack[:-(cutoff-1)] if cutoff != 0 else stack

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
		# let's make it go all the way up the stack trace and collect locals
		st = inspect.stack() # may also use inspect.trace()
		data = []
		for fr in st:
			data.append( fr.fr_locals() )

		self.data(data)



