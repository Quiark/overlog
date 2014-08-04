import os
import re
import sys
import time
import json
import pprint
import httplib
import inspect
import logging
import traceback
import threading
import _threading_local


LOG = logging.getLogger('ovlg')

MAX_STRDUMP=100
HAS_UTF8 = re.compile(r'[\x80-\xff]')

def has_utf8(s): return HAS_UTF8.search(s) is not None

def ByteToHex( byteStr ):
	""" Convert a byte string to it's hex string representation e.g. for output.  """
	return ''.join( [ "%02X" % ord( x ) for x in byteStr ] ).strip()


def trace_works():
	'Its here to check if tracing works once enabled.'
	pass

FILTER_GROUPS = {
		'nose': ['site-packages/nose'],
		'py-unittest': ['unittest/main.py', 'unittest/runner.py', 'unittest/loader.py', 'unittest/case.py'],
		'py': ['lib/python2.7'],
		'overlog': ['overlog/__init__.py']
}

SELECTED_GROUPS = ['nose', 'py-unittest', 'overlog', 'py']

# TODO: refactor or remove
class ZmqClient(object):
	def __init__(self):
		pass

	def Connect(self, address):
		import zmq

		self._context = zmq.Context()
		self._socket = self._context.socket(zmq.PUB)
		self._socket.connect(address)

		print 'connected, sending control pwd'

		for i in range(3):
			self.SendMessage({
						'__control': 'set_cwd',
						'pid': os.getpid(),
						'cwd': os.getcwdu()
			})

	def SendMessage(self, value):
		if self._socket == None:
			raise Exception("Attempt to send message without connection.")

		json_val = json.dumps(value)
		#pprint.pprint(value)

		dat = json_val
		if ('__control' in value): dat = '#' + json_val
		LOG.debug('msg {} being sent in overlog.client'.format(dat[:16]))
		self._socket.send(dat)


class HttpClient(object):
	def Connect(self, address):
		self.address = address
		self.host = 'localhost:8111'

		self.reconnect()

		self.SendMessage({
			'__control': 'set_cwd',
			'pid': os.getpid(),
			'cwd': os.getcwdu()
		})

	def reconnect(self):
		self.conn = httplib.HTTPConnection(self.host)

	def SendMessage(self, value):
		json_val = json.dumps(value)
		dat = json_val
		if ('__control' in value): dat = '#' + json_val
		LOG.debug('msg {} being sent in overlog.client'.format(dat[:16]))

		for retry in range(3):
			try:
				self.conn.request('POST', '/msg/', dat)
				response = self.conn.getresponse()
				response.read()
				return

			except:
				LOG.exception('sending msg')
				self.reconnect()


class FrameDump(object):
	def __init__(self, localvars, position):
		self.localvars = localvars
		self.position = position


class Dumper(object):
	'Converts any Python thing into a JSON-compatible object'

	PRIMITIVES = (int, long, float, str, unicode)
	DEPTH = 6

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
			# got some weird ctypes object here that can't handle repr
			pass
			#return u'<object repr:"{}" already seen before>'.format(repr(obj)[:MAX_STRDUMP])

	def print_toodeep(self, obj, depth):
		return '<too deep>'

	def convert_obj(self, obj, depth=None):
		if depth == None: depth = self.DEPTH

		# handle binary
		obj = self.handle_binary(obj)

		# primitive objects can be always handled
		if isinstance(obj, self.PRIMITIVES): return obj

		# if seen, skip
		if id(obj) in self.seen:
			return self.print_seen(obj)

		self.seen.add(id(obj))

		# limit depth
		if depth == 0: return self.print_toodeep(obj, depth)

		return self.convert_obj_rec(obj, depth)

	def convert_obj_rec(self, obj, depth=4):

		try:
			# normal execution - go inside
			if isinstance(obj, list) or isinstance(obj, tuple) or isinstance(obj, set):
				return [self.convert_obj(x, depth-1) for x in obj]
			if isinstance(obj, dict):
				return {self.stringize(k): self.convert_obj(obj[k], depth-1) for k in obj if self.attr_filter(k, obj[k])}
		except:
			LOG.exception('iterating object')


		# at this stage we only have custom types
		try:
			dump = getattr(obj, '__dump__', None)
			if dump:
				res = dump()
			else:
				res = self.std_dump(obj)
			return self.convert_obj(res, depth)
		except:
			LOG.exception('trying to call __dump__')

		return {}


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

	def dump_frame_to_caller(self, frame):
		return {'name': frame.f_code.co_name,
				'filename': frame.f_code.co_filename,
				'lineno': frame.f_lineno}

	def dump_frameobject(self, frame, depth=None):
		depth = depth or 10
		filtered_out = filter_filename

		fr = frame
		data = []
		count = 0
		while (fr != None) and (count < depth):
			filename = fr.f_code.co_filename

			if filtered_out(filename):
				data.append(filename + ' filtered out')
			else:
				position = {'pid': os.getpid(),
							'lineno':fr.f_lineno,
							'name': fr.f_code.co_name,
							'filename': filename}
				data.append(FrameDump( fr.f_locals, position ))

			fr = fr.f_back
			count += 1

		return data

def filter_filename(fname):
	fname = fname.replace('\\', '/')
	for f in SELECTED_GROUPS:
		for it in FILTER_GROUPS[f]:
			if it in fname: return True

	return False



class NewDumper(Dumper):
	'''New format:
	{
		data:
			__class: list
			__data:
				0: 'abc'
				1: 'def'
				2: 4
				3:
					__class: BackupTask
					__data:
						target_folder: "C:/temp"
				4:
					__class: AppFrame
					__seen_at: ?? some ref ??
					__data: (string repr)


	There are two modes in which an object can be serialised. Directly, where
	there is no metadata about a given object and extended where the data
	is first wrapped in another JSON object with some metadata. POD types
	such as int, string, ... will typically be entered directly.


	'''

	def convert_obj_rec(self, obj, depth=4):
		if isinstance(obj, (list, tuple, dict)):
			return Dumper.convert_obj_rec(self, obj, depth)
		else:
			# custom type (or set or dict)
			return self.extend_wrap( obj, Dumper.convert_obj_rec(self, obj, depth) )


	def extend_wrap(self, obj, dumped):
		return {'__class': type(obj).__name__,
				'__id': id(obj),
				'__data': dumped}

	def print_seen(self, obj):
		if obj in ['', None, [], (), {}, set()]: return obj
		strdata = ''
		try:
			if isinstance(obj, str):
				strdata = self.handle_binary(str)
			elif isinstance(obj, unicode):
				strdata = str
			else:
				strdata = self.handle_binary(str(obj)[:MAX_STRDUMP])
		except:
			LOG.warning('Got something of type {} that cant be converted'.format(str(type(obj))))

		return {'__seen': True, '__data': strdata}

	def print_toodeep(self, obj, depth):
		return {'__err': 'too_deep'}


class Logger(object):
	def __init__(self):
		#self.rc = ZmqClient()
		self.rc = HttpClient()
		self.rc.Connect("tcp://localhost:5111")

		self.my_thread = threading.current_thread().ident
		self.to_trace = set()

		# what must be present in path in order to get events
		self.filter_project = ''
		self.filter_function = set(['trace_works'])

		# use when it's not necessary to re-create Dumper
		self.dmp = NewDumper()


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
			if thr.ident != self.my_thread:
				LOG.warning('Called wrong logger from wrong thread.')
				return

			msg = {'time': time.time(),
				'pid': os.getpid(),
				'stack': self.filter_stack( traceback.extract_stack() ),
				'data': NewDumper().dump(data),
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
			LOG.exception('in overlog, ignoring')

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
		self.rc.SendMessage(msg)

	def trace_fmt(self):
		#if len(self.to_trace) == 0:
			#sys.setprofile(self.tracer)

		self.to_trace.add(self.t_format)

	def trace_function(self, fnlist):
		self.filter_function.update(fnlist)
		self.to_trace.add(self.t_function)

		trace_works()

	def trace_except(self):
		sys.settrace(self.exc_tracer)

	def t_format(self, frame, event, arg):
		if event != 'c_call' or arg.__name__ != 'format' or not isinstance(arg.__self__, (str, unicode)):
			return False
		return frame.f_locals


	def t_function(self, frame, event, arg):
		coname = frame.f_code.co_name
		if event != 'call' or not (coname in self.filter_function): return False
		return self.dmp.dump_frameobject(frame)

	def tracer(self, frame, event, arg):
		if frame.f_code.co_filename == __file__: return
		res = None
		for x in self.to_trace:
			res = x(frame, event, arg)
			if res: break

		if not res: return

		data = res
		caller = self.dmp.dump_frame_to_caller(frame)
		self.send_data(data, caller=caller, mode='tracer')

	def exc_tracer(self, frame, event, arg):
		# this gets invoked for all functions up the call chain
		# TODO: usually, I wont be interested in all that
		ret = self.exc_tracer
		try:
			if event != 'exception':
				self.tracer(frame, event, arg)
				return ret

			caller = self.dmp.dump_frame_to_caller(frame)

			# filter to project filenames
			if not (self.filter_project in caller['filename']): return ret
			if filter_filename(caller['filename']): return ret

			exception, evalue, etraceback = arg

			dat = NewDumper().dump_frameobject(frame)
			dat.append(evalue)
			self.send_data(dat, caller=caller, mode='exc_tracer')

		except Exception as e:
			print 'exception ', e
		return ret


	# decorator
	def method(self, fn):
		def _internal(_self, *args, **kwargs):
			data = self.pack_args(*args, **kwargs)
			caller = self.dmp.dump_function(fn)
			self.send_data(data, func_name=fn.func_name, caller=caller, mode='method decorator')
			return fn(_self, *args, **kwargs)

		return _internal


	# decorator
	def classy(self, cls):
		return cls

	def loc(self, depth=None):
		# let's make it go all the way up the stack trace and collect locals
		st = inspect.stack() # may also use inspect.trace()
		f = st[0][0]
		data = NewDumper().dump_frameobject(f, depth)

		self.send_data(data, mode='loc')

	def exception(self):
		etype, evalue, etb = sys.exc_info()
		self.data(NewDumper().dump_frameobject(etb.tb_frame))


class LogManager(object):
	def __init__(self):
		self.tlocal = _threading_local.local()

	def logger(self):
		try:
			return self.tlocal.logger
		except AttributeError:
			res = self.tlocal.logger = Logger()
			return res

#logging.basicConfig(level=0)

MANAGER = LogManager()

def ovlg():
	return MANAGER.logger()

Overlog = ovlg
