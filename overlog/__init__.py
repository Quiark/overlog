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

	PRIMITIVES = (int, long, float, str, unicode)

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
		# handle binary
		obj = self.handle_binary(obj)

		# primitive objects can be always handled
		#composite = (list, dict, tuple, set)
		if isinstance(obj, self.PRIMITIVES): return obj

		# if seen, skip
		if id(obj) in self.seen:
			return self.print_seen(obj)

		self.seen.add(id(obj))

		# limit depth
		if depth == 0: return '<too deep>'

		# normal execution - go inside
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
		res['__type'] = str(type(obj))

		return self.convert_obj(res, depth)

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

	def dump_frameobject(self, frame, depth=10):
		fr = frame
		data = []
		count = 0
		while (fr != None) and (count < depth):
			record = {'__lineno':fr.f_lineno,
						'__name': fr.f_code.co_name,
						'__filename': fr.f_code.co_filename}
			record.update( fr.f_locals )
			data.append(record)

			fr = fr.f_back
			count += 1

		return data

class Logger(object):
	def __init__(self):
		self.rc = RCP3Client()
		self.rc.Connect("tcp://localhost:5111")
		self.to_trace = set()
		# use when it's not necessary to re-create Dumper
		self.dmp = Dumper()


	def data(self, *args, **kwargs):
		data = self.pack_args(*args, **kwargs)
		self.send_data(data, mode='data')

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
		if len(self.to_trace) == 0:
			sys.setprofile(self.tracer)

		self.to_trace.add(self.t_format)

	def trace_except(self):
		if len(self.to_trace) == 0:
			sys.setprofile(self.tracer)

		self.to_trace.add(self.t_except)


	def t_format(self, frame, event, arg):
		if event != 'c_call' or arg.__name__ != 'format' or not isinstance(arg.__self__, (str, unicode)):
			return False
		return frame.f_locals

	def t_except(self, frame, event, arg):
		if event != 'exception': return False
		return Dumper().dump_frameobject(frame)

	def tracer(self, frame, event, arg):
		if frame.f_code.co_filename == __file__: return
		res = None
		for x in self.to_trace:
			res = x(frame, event, arg)
			if res: break

		if not res: return

		data = res
		caller = {'name': frame.f_code.co_name,
					'filename': frame.f_code.co_filename,
					'lineno': frame.f_lineno}
		self.send_data(data, caller=caller, mode='tracer')


	# decorator
	def method(self, fn):
		def _internal(_self, *args, **kwargs):
			data = self.pack_args(*args, **kwargs)
			caller = Dumper().dump_function(fn)
			self.send_data(data, func_name=fn.func_name, caller=caller, mode='method decorator')
			return fn(_self, *args, **kwargs)

		return _internal


	# decorator
	def classy(self, cls):
		return cls

	def loc(self):
		# let's make it go all the way up the stack trace and collect locals
		st = inspect.stack() # may also use inspect.trace()
		data = []
		for fr in st:
			data.append( fr[0].f_locals )

		self.send_data(data, mode='loc')

	def exception(self):
		etype, evalue, etb = sys.exc_info()
		self.data(Dumper().dump_frameobject(etb.tb_frame))


