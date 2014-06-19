import os
import sys
import logging

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


class MessagePasser(object):
	def __init__(self):
		self.wsock = None

	def set_websocket(self, wsock):
		self.wsock = wsock

	def zmq_recv(self, msgs):
		if self.wsock == None:
			logging.error('No WebSocket connected')
			return

		for i in msgs:
			#jsonMessage = json.loads(i)
			self.wsock.write_message(i)


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

		])

		app.listen(port)
		tornado.ioloop.IOLoop.instance().start()
	except:
		logging.exception('in main loop')

if __name__ == '__main__':
	run(8111)
