class Logger(object):
	def data(self, *args, **kwargs):
		pass

	def method(self, fn):
		return fn

	def loc(self, *args, **kwargs):
		pass

	def trace_except(self):
		pass

def ovlocal(*args, **kwargs):
	pass

def ovlg():
	return Logger()
