import os
import sys
import pprint
import unittest

sys.path.append('.')

import overlog


TDATA_LIST = [1, 2, 3, 'aaa', 'bbb']
TDATA_DICT = {'CZ': 'Czech', 'US': "United States", "TH": "Thailand"}


class Animal(object):
	def __init__(self):
		self.species = 'dog'
		self.legs = 4

TDATA_OBJ = Animal()

class DumperTest(unittest.TestCase):
	def setUp(self):
		self.dmp = overlog.NewDumper()

	def test_basic(self):
		pprint.pprint(self.dmp.dump(TDATA_OBJ))
		pprint.pprint(self.dmp.dump(TDATA_LIST))
		pprint.pprint(self.dmp.dump(TDATA_DICT))
		pprint.pprint(self.dmp.dump(self))

		self.fail('ah')


	

