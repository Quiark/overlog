import os
import sys
import logging
import argparse

import tornado.ioloop
import tornado.websocket
from threading import Thread
import threading
import json
from Queue import Empty



class WebSocketHandler(tornado.websocket.WebSocketHandler):
	def initialize(self, passer):
		self.passer = passer
		self.passer.set_websocket(self)

	def open(self, *args):
		self.stream.set_nodelay(True)

	def on_close(self):
		pass


class NoCacheStaticFileHandler(tornado.web.StaticFileHandler):
	def set_extra_headers(self, path):
		# Disable cache
		self.set_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')


class MsgHandler(tornado.web.RequestHandler):
	def initialize(self, passer):
		self.passer = passer

	def post(self):
		pid = self.get_argument('pid', None)
		result = json.dumps( self.passer.on_msg( self.request.body, pid ) or [] )
		self.write( result )


class RpcHandler(tornado.web.RequestHandler):
	def initialize(self, passer):
		self.passer = passer

	def post(self):
		self.passer.add_rpc( self.request.body )


class GetSourceHandler(tornado.web.RequestHandler):
	def initialize(self, passer):
		self.passer = passer

	def post(self):
		CONTEXT = 4

		js = json.loads(self.request.body)
		fname = os.path.join(self.passer.cwd[ js['pid'] ], js['filename'])
		lineno = js['lineno']

		with open(fname) as inf:
			lines = inf.readlines()

			dat = lines[lineno-CONTEXT:lineno+CONTEXT]
			dat = map(lambda x: '{}{}:{}'.format(x[0], '>' if x[0] == lineno else '', x[1]),
						zip(
							range(lineno-CONTEXT, lineno+CONTEXT),
							dat))

		self.write(''.join(dat))



class MessagePasser(object):
	def __init__(self):
		self.wsock = None
		self.cwd = {}
		self.rpc_lists = {}

	def set_websocket(self, wsock):
		self.wsock = wsock

	def on_msg(self, msg, pid=None):
		if msg[0] == '#':
			self.control_message(msg)
		elif self.wsock:
			self.wsock.write_message(msg)

		pid = str(pid)
		if pid in self.rpc_lists:
			if len(self.rpc_lists[pid]) > 0:
				result = self.rpc_lists[pid]
				self.rpc_lists[pid] = []
				return result

		elif 'new' in self.rpc_lists:
			# make sure this process is not 'new' any more
			self.rpc_lists[pid] = []
			# send everything but don't delete
			return self.rpc_lists['new']

	def add_rpc(self, body):
		# thread - unsafe
		obj = json.loads(body)
		pid = str(obj['pid'])
		lst = self.rpc_lists.get(pid, [])
		lst.append(obj)
		self.rpc_lists[pid] = lst


	def control_message(self, msg):
		js = json.loads(msg[1:])
		logging.info('Control message ' + msg)

		ctl = js['__control']
		if ctl == 'set_cwd':
			self.cwd[ js['pid'] ] = js['cwd']


def run(port):
	try:
		logging.info('Running web server on port {}'.format(port))

		passer = MessagePasser()


		app = tornado.web.Application([
			(r'/static/(.*)', NoCacheStaticFileHandler, {'path': os.path.join(os.path.dirname(__file__), "static")}),
			(r'/WebSockets/', WebSocketHandler, {'passer': passer}),
			(r'/getsrc/', GetSourceHandler, {'passer': passer}),
			(r'/msg/', MsgHandler, {'passer': passer}),
			(r'/rpc/', RpcHandler, {'passer': passer})
		])

		app.listen(port)
		tornado.ioloop.IOLoop.instance().start()
	except:
		logging.exception('in main loop')

if __name__ == '__main__':
	parser = argparse.ArgumentParser(description='Overlog server')
	parser.add_argument('-v', '--verbose', dest='verbose', action='store', default=40,
			help='Log level')
	args = parser.parse_args()

	logging.basicConfig(level=int(args.verbose))
	run(8111)
