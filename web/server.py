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

import zmq

from zmq.eventloop import ioloop
from zmq.eventloop.zmqstream import ZMQStream
ioloop.install()


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


class GetSourceHandler(tornado.web.RequestHandler):
	def initialize(self, passer):
		self.passer = passer

	def post(self):
		CONTEXT = 4

		logging.debug(self.passer.cwd)
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

	def set_websocket(self, wsock):
		self.wsock = wsock

	def zmq_recv(self, msgs):
		if self.wsock == None:
			logging.error('No WebSocket connected')

		for i in msgs:
			logging.debug('zmq recv msg ' + i)
			if i[0] == '#':
				self.control_message(i)
			elif self.wsock:
				self.wsock.write_message(i)

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

		socket = zmq.Context.instance().socket(zmq.SUB)
		socket.bind("tcp://*:5111")
		socket.setsockopt(zmq.SUBSCRIBE, "")
		stream = ZMQStream(socket)
		stream.on_recv(passer.zmq_recv)

		app = tornado.web.Application([
			(r'/static/(.*)', NoCacheStaticFileHandler, {'path': os.path.join(os.path.dirname(__file__), "static")}),
			(r'/WebSockets/', WebSocketHandler, {'passer': passer}),
			(r'/getsrc/', GetSourceHandler, {'passer': passer})
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
