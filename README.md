Overlog
========


Increase your productivity by logging copious amounts of data!



Useful tips
-----------

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
