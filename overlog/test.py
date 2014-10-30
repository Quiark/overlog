import os
import sys
import time
import logging

import overlog
OLOG = overlog.ovlg()
ovlocal = overlog.ovlocal



class SomeClass(object):
	def __init__(self):
		self.a = 1
		self.b = 'cc'
		self.sel = self
		self.binary = '\x00\xe0\xd0\xdd\a\xec'

	def x__dump__(self):
		return [self.a, self.b]

	@OLOG.method
	def method(self, x):
		print 3 + x

	def call_something(self):
		return self.test_abc()

	def fact(self, n):
		if (n == 0):
			ovlocal()
			raise RuntimeError('ty we')
			return 1
		val = n
		val *= self.fact(n - 1)
		print 'fact', n, val
		return val

	def test_abc(self):
		OLOG.data('hello', {
			1: 'world',
			'c': [1, 2, 3],
			'3': {
				's': self,
				'x': 'x'
			}
		})


TESTDATA = [1, 'abc', u'bcd', SomeClass()]

if __name__ == '__main__':
	logging.basicConfig(level=0, format='%(levelname)s T%(thread)d:%(threadName)s| %(message)s')

	x = SomeClass()
	x.method(4)
	x.test_abc()

	while True:
		try:
			z = raw_input('>')
			OLOG.data(z, SomeClass())
			x.call_something()
			x.fact(3)
		except:
			pass

