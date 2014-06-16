import os
import sys
import logging

import overlog
OLOG = overlog.Logger()

OLOG.trace_fmt()
#STR_FORMAT = str.format.__get__(
def tracer(frame, event, arg):
	if event != 'c_call' or arg.__name__ != 'format' or not isinstance(arg.__self__, (str, unicode)): return

	#print 'trace event',  func_name, event, arg
	#print dir(arg), arg.__self__
	print frame.f_locals



'a> {} <ab> {} <b'.format('abc', 'xyz')
gz = 'a> {} <ab> {} <b'
gz.format(1, 2)

logging.info( 'a> {} <ab> {} <b'.format('abc', 'xyz') )


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


	def test_abc(self):
		OLOG.data('hello')


TESTDATA = [1, 'abc', u'bcd', SomeClass()]

if __name__ == '__main__':
	x = SomeClass()
	x.method(4)
	x.test_abc()

	'a> {} <ab> {} <b'.format('abc', 'xyz')

	while False:
		z = raw_input('>')
		OLOG.data(z, SomeClass())
