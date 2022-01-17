import os
import sys

if os.getenv("OVERLOG_DISABLE", 0) in [1, 'true', 'True']:
    from .noop import *
else:
    from .impl import *

