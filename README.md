Overlog
========

Increase your debugging and development productivity by logging copious amounts of data!

A mixed approach between debugging and logging, this package dumps your objects 
into an HTML+JS based browser where you can later inspect them and find problems.
You can initiate a dump by inserting a call into your code or any time an exception
is thrown. You can dump specific values or the entire stack frame, including up in the
call stack.

Of course this can be time or memory consuming. That's why it's not recommended to be used in production
at all, dumps are limited in depth and we try to filter out uninteresting files from
the Python library. Even with these restrictions, I find it useful.

The HTML+JS data browser has some filtering and grouping capabilities, can filter dumps
from different processes based on PID, group dumps by thread, enclosing stack frame or



Use cases
---------

1. Enable exception tracing and enjoy the ability to record & inspect context any time
   an exception is thrown.
2. Something is wrong and you're too lazy to launch a debugger or type exact object
   address to logging. Just drop a line of `ovlocal()` in that place and look things
   up in the browser.
3. Keeping track of values between different test runs.


Architecture
------------

The overlog library is included in your programt that needs debugging. When dumping
is invoked, it creates a JSON representation of the object(s) of interest and sends
them using standard HTTP to a Python Tornado server running in the background which
in turn, is connected to the browser via WebSockets. The browser receives objects in
JSON and displays them on the page.

Useful tips
-----------

### Auto-add ovlg to sys

Create a `sitecustomize.py` file and put it in your site-packages with the following
content:

```
try:
	from overlog import ovlg
	import sys
	sys.ovlg = ovlg
except:
	pass
```

and then you don't ever need to import overlog again!


Credits & licensing
-------------------

This project was strongly inspired by Bret Victor, the LightTable editor and people behind it
and also the https://github.com/Akson/RemoteConsolePlus3 project.

The code is LGPL because I would like to see contributions coming back but at the same
time, it should not limit you because this library is not intended to be redistributed
with other software.
