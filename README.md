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

![screenshot](https://raw.githubusercontent.com/Quiark/Overlog/master/doc/screenshot.png)

The code is a bit messy, sometimes downright unmaintainable. Sorry for that, it was written
in a rush :)

Use cases
---------

1. Enable exception tracing and enjoy the ability to record & inspect context any time
   an exception is thrown.
2. Something is wrong and you're too lazy to launch a debugger or type exact object
   address to logging. Just drop a line of `ovlocal()` in that place and look things
   up in the browser.
3. Keeping track of values between different test runs.



Making use of Overlog
---------------------

(don't need to clone the repo first)

1. Create a virtualenv for overlog: `python3 -m venv ovenv`
2. Activate the env: `source ovenv/bin/activate`
3. Install the package: `pip install git+https://github.com/quiark/overlog.git#egg=overlog`
2. Run the web server: `python ovenv/lib/python3.11/site-packages/overlog/server.py`
3. Open `http://localhost:8111/` in your browser
3. In your code:

```
from overlog import ovlg, ovlocal

# now somewhere in your code:
def my_computation(rabbits, wolves):
	new_rabbits -= 2*wolves
	grass = 100 - 3*new_rabbits

	ovlocal()
	# ^ this dumps the current stack frame which includes the variables rabbits, wolves, new_rabbits and grass
	#   and also dumps a few stack frames up the call stack

```
4. Switch to the browser and explore your object dump there.



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

### Auto-start web server

I actually like to auto-run the overlog server after system boot so it's always ready
to use.


Credits & licensing
-------------------

This project was strongly inspired by Bret Victor, the LightTable editor and people behind it
and also the https://github.com/Akson/RemoteConsolePlus3 project.

The code is LGPL because I would like to see contributions coming back but at the same
time, it should not limit you because this library is not intended to be redistributed
with other software.
