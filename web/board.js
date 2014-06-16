function Build() {
	this.$_parent = null;
	this.parent_stack = [];
};

Build.prototype.set_parent = function(p) {
	this.$_parent = p;
	return this;
}

Build.prototype.div = function(kls) {
	return this.elem('div', kls);
}

Build.prototype.elem = function(tag, kls) {
	var elem = $('<' + tag + ' />');
	if (kls) elem.addClass(kls);
	if (this.$_parent) elem.appendTo(this.$_parent);
	return elem;
}

Build.prototype.push_parent = function($elem) {
	this.parent_stack.push($elem);
	this.set_parent($elem);
}

Build.prototype.pop_parent = function() {
	var prev = this.parent_stack.pop();
	this.set_parent(this.parent_stack[this.parent_stack.length - 1]);
	return prev;
}

Build.prototype.span = function(kls) {
	return this.elem('span', kls);
}

Build.prototype.tr = function(kls) {
	return this.elem('tr', kls);
}

Build.prototype.td = function(kls) {
	return this.elem('td', kls);
}

Build.prototype.ul = function(kls) {
	return this.elem('ul', kls);
}

Build.prototype.li = function(kls) {
	return this.elem('li', kls);
}

Build.prototype.dumpobj = function(indent, obj, $_parent) {
	this.push_parent($_parent);

	for (var key in obj) {
		var val = obj[key];

		var $line = this.tr('line');
		this.push_parent($line);

		var $collapse = this.td('button').addClass('collapse').text('+');
		var $name = this.td('name').text(key).css('padding-left', indent * 20 + 'px');

		if (typeof(val) != 'object') {
			var $val = this.td('value').text(val);
			$collapse.remove();
			this.pop_parent();

		} else {
			// just a simple text
			var $val = this.td('value').text('[...]');
			this.pop_parent();

			// nested value is next div
			var $sub = this.div('nested');
			this.push_parent($sub);

			this.dumpobj(indent + 1, val, $sub);

			$collapse.data('$sub', $sub);
			$collapse.click(function(evt) {
				$(this).data('$sub').slideToggle(100);
			});

			$sub.toggle(); // invisible by default

			this.pop_parent();
		}
	}

	this.pop_parent();
}

Build.prototype.dumpstack = function(stack, $_parent) {
	this.push_parent($_parent);
	this.push_parent(this.elem('ul'));

	for (var key in stack) {
		var frame = stack[key];
		var $line = this.elem('li');

		this.push_parent($line);
			this.span('filename').text(frame[0]);
			this.span('lineno').text(':' + frame[1]);
			this.span('function').text(frame[2]);
			this.span('line').text(frame[3]);
		this.pop_parent();
	}

	this.pop_parent();
	this.pop_parent();
}

function rnd_choose(choices) {
  var index = Math.floor(Math.random() * choices.length);
  return choices[index];
}

function Stack(builder, $parent) {
	this.items = [];
	this.builder = builder;


	var b = new Build();
	b.push_parent($parent);

	this.$choices = b.div('choices');
	this.$container = b.div('container');

}

Stack.prototype.add_item = function(val) {
	// array only
	this.items.push(val);
	var key = this.items.length -1;

	var self = this;

	var b = new Build();
	b.set_parent(this.$choices);
	var $elem = b.span('button').text(key).attr('data-sel', key);
	$elem.click(function(evt) {
		self.do_switch($(this).attr('data-sel'));
	});

	if (key == 0) {
		this.do_switch(key);
	}
};

Stack.prototype.do_switch = function(key) {
	var item = this.items[key];
	this.$container.empty();

	this.builder( item, this.$container );
}

OverlogBoard = {
	init: function($elem) {
		this.$main = $elem;
		this.all_data = [];

		this.group_recipes = {
			'pid': {
				keyfn: function(val) { return val.pid; },
				elm_attr: 'data-pid',
				headfn: function(val, $header) { $header.text('pid:' + val.pid); }
			},
			'caller': {
				keyfn: function(val) { return val.caller.hash; },
				elm_attr: 'data-caller',
				headfn: function(val, $header) {
						$header.text('caller:' + val.caller.name + ':' + val.caller.lineno);
				}
			}
		};

		this.state = {
			grouping: 'caller'
		};

		this.groups = {};
		this.representatives = {};


		$(document).on('click', 'div.msg  .stack_toggle', function(evt) {
			$('.stack', $(this).parent().parent()).toggle();
		});

		this.active_msg_btn('size_toggle', function($btn, $msg) {
			$msg.toggleClass('smallmsg');
		});
	},

	active_msg_btn: function(cls, handler) {
		var self = this;
		$(document).on('click', 'div.msg  .'+cls, function(evt) {
			handler( $(this), $(this).parent().parent() );
		});

	},

	add_message: function(msg) {
		/*
		this.all_data.push(msg);

		this.build_message(msg, this.$main);
		*/
		this.add_by_group(msg);

	},

	build_message: function(msg, $parent) {
		var b = new Build();
		var $msg = b.div('msg').appendTo($parent);
		$msg.data(msg);
		$msg.attr('data-pid', msg.pid);
		$msg.draggable({ containment: "parent", handle: ".header" });
		b.push_parent($msg);

		b.push_parent( b.div('header') );
		b.span().text('PID: ');
		b.span('pid').text(msg.pid);
		var $tog_stack = b.span('stack_toggle').addClass('button').text('+ stack');
		b.span('size_toggle').addClass('button').text('+ enlarge');
		/*
		b.span().addClass('button').text('( pid').click(function(evt) { OverlogBoard.group_by_preset('pid'); });
		b.span().addClass('button').text('( caller').click(function(evt) { OverlogBoard.group_by_preset('caller'); });
		*/
		b.pop_parent();

		b.dumpstack(msg.stack, b.div('stack').css('display', 'none'));
		b.set_parent($msg);
		b.dumpobj(0, msg.data, b.div('data'));

		try {
			b.set_parent($msg);
			b.dumpobj(0, msg.caller, b.div('caller'));
			$msg.attr('data-caller', msg.caller.hash);
		} catch (e) { };

	},

	test: function() {
		var obj = {k: 'hello', l: 'world'};
		var pids = [111, 222, 333];

		for (i = 0; i < 3; i++) {
			var obj = {"pid": rnd_choose(pids), "data": {"added_files": ["C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\inc_testfile_f0m38t.txt"], "backup_files": ["5F528261B1B115E985DC32F043805699C0689D12"], "bdetails": {"clientid": ["2Topinka's Windows-7-6.1.7600-124191492294245", "test_6513"], "snapshot_id": 1402310939922}, "self": {"test": {"src_provider": {"testcase": "<object \"test_incremental (app.BackupTest)\" already seen before>", "path": "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb", "incr_added": "<object \"['C:\\\\Devel\\\\PyBrowser\\\\SnowBox\\\\projects\\\\DesktopClient\\\\tests\\\\tstdata\\\\sd_c8qjgb\\\\inc_testfile_f0\" already seen before>", "to_delete": ["<object \"C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\inc_testfile_f0m38t.txt\" already seen before>"]}, "_testMethodName": "test_incremental", "_diffThreshold": 65536, "_resultForDoCleanups": "<object \"{'__module__': 'nose.proxy', '__str__': <method-wrapper '__str__' of ResultProxy object at 0x0389171\" already seen before>", "app": "<object \"{'__module__': 'snowclient', 'on_exception': <bound method SnowApp.on_exception of <snowclient.SnowA\" already seen before>", "factory": "<object \"{'__module__': 'app', '__format__': <built-in method __format__ of TestAppFactory object at 0x038918\" already seen before>", "somefiles": ["C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sf_4k0q8y", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sf_v0mon4", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sf_dn1fck", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sd_p6bn0w\\sf_tiu70b", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sd_p6bn0w\\sf_45a63q", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sd_p6bn0w\\sf_jzknts", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sd_odpeg4\\sf_zhk0p2", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sd_odpeg4\\sf_xwav1r", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sd_odpeg4\\sf_hq1olj", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sd_2i948j\\sf_xi6gwc", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sd_2i948j\\sf_eqbjxc", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sd_2i948j\\sf_n8ujoh"], "_cleanups": [], "_type_equality_funcs": {"<type 'list'>": "assertListEqual", "<type 'set'>": "assertSetEqual", "<type 'frozenset'>": "<object \"assertSetEqual\" already seen before>", "<type 'unicode'>": "assertMultiLineEqual", "<type 'dict'>": "assertDictEqual", "<type 'tuple'>": "assertTupleEqual"}, "longMessage": true, "failureException": {"message": {}, "args": "<object \"{'__setattr__': <method-wrapper '__setattr__' of getset_descriptor object at 0x003B8210>, '__reduce_\" already seen before>"}, "maxDiff": 640, "chkstorage": "<object \"<app.LocalStorageChecker object at 0x038917F0>\" already seen before>", "_testMethodDoc": "<object \"{'__setattr__': <method-wrapper '__setattr__' of NoneType object at 0x1E222C0C>, '__reduce_ex__': <b\" already seen before>", "_classSetupFailed": false, "backup_details": "<object \"{'clientid': ClientId(device=\"2Topinka's Windows-7-6.1.7600-124191492294245\", username='test_6513'),\" already seen before>"}, "base_path": "c:\\Temp\\BoxServer\\NewStore"}}, "stack": [["C:\\Software\\cmdline\\nosetests-script.py", 9, "<module>", "load_entry_point('nose==1.3.3', 'console_scripts', 'nosetests')()"], ["C:\\Devel\\Python\\lib\\site-packages\\nose-1.3.3-py2.7.egg\\nose\\core.py", 121, "__init__", "**extra_args)"], ["C:\\Devel\\Python\\lib\\unittest\\main.py", 95, "__init__", "self.runTests()"], ["C:\\Devel\\Python\\lib\\site-packages\\nose-1.3.3-py2.7.egg\\nose\\core.py", 207, "runTests", "result = self.testRunner.run(self.test)"], ["C:\\Devel\\Python\\lib\\site-packages\\nose-1.3.3-py2.7.egg\\nose\\core.py", 62, "run", "test(result)"], ["C:\\Devel\\Python\\lib\\site-packages\\nose-1.3.3-py2.7.egg\\nose\\suite.py", 176, "__call__", "return self.run(*arg, **kw)"], ["C:\\Devel\\Python\\lib\\site-packages\\nose-1.3.3-py2.7.egg\\nose\\suite.py", 223, "run", "test(orig)"], ["C:\\Devel\\Python\\lib\\site-packages\\nose-1.3.3-py2.7.egg\\nose\\suite.py", 176, "__call__", "return self.run(*arg, **kw)"], ["C:\\Devel\\Python\\lib\\site-packages\\nose-1.3.3-py2.7.egg\\nose\\suite.py", 223, "run", "test(orig)"], ["C:\\Devel\\Python\\lib\\site-packages\\nose-1.3.3-py2.7.egg\\nose\\case.py", 45, "__call__", "return self.run(*arg, **kwarg)"], ["C:\\Devel\\Python\\lib\\site-packages\\nose-1.3.3-py2.7.egg\\nose\\case.py", 133, "run", "self.runTest(result)"], ["C:\\Devel\\Python\\lib\\site-packages\\nose-1.3.3-py2.7.egg\\nose\\case.py", 151, "runTest", "test(result)"], ["C:\\Devel\\Python\\lib\\unittest\\case.py", 395, "__call__", "return self.run(*args, **kwds)"], ["C:\\Devel\\Python\\lib\\unittest\\case.py", 331, "run", "testMethod()"], ["C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\app.py", 395, "test_incremental", "self.chkstorage.check_incremental(self.src_provider.incr_added, self.backup_details)"], ["C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\app.py", 140, "check_incremental", "OLOG.loc(locals())"], ["C:\\Devel\\Python\\lib\\site-packages\\overlog-0.1\\overlog.py", 164, "loc", "self.send_data(loc)"]], "time": 1402310940.321};
			this.add_by_group(obj);
		}

		//this.group_by();
	},

	group_by_preset: function(preset) {
		if (preset == 'pid') {
		} else if (preset == 'caller') {
		}
	},

	group_by: function(keyfn, elm_attr, head_fn) {
		/*
		var groups = {};
		var representatives = {};

		for (var i in this.all_data) {
			var val = this.all_data[i];
			var keyval = keyfn(val);

			var grp = null;
			if (keyval in groups) {
				grp = groups[keyval];
			} else {
				grp = [];
				groups[keyval] = grp;

				// also store one representative
				representatives[keyval] = val;
			}

			grp.push( val );
		}

		this.groups = groups;
		*/

		$.each(this.all_data, function(ix, elm) {
			this.add_by_group(elm);
		});

		// now build DOM
		//var $msg = $('div.msg', this.$main);
		this.$main.empty();

		var b = new Build();
		b.push_parent(this.$main);
		for (var k in groups) {
			var obj = groups[k];

			var $group = b.div('group');
			b.push_parent( $group );
				head_fn( representatives[k], b.span('header') );

				var switcher = new Stack(obj, this.build_message, $group);
				/*
				$msg.each(function(ix, elm) {
					var $elm = $(elm);
					if ($elm.attr(elm_attr) == k) {
						$elm.appendTo($group);
						$elm.addClass('smallmsg');
					}

				});
				*/

			b.pop_parent();
		}
	},

	add_by_group: function(msg) {
		var recipe = this.group_recipes[this.state.grouping];

		// already added to all_data, now just adjust grouping
		var keyval = recipe.keyfn(msg);
		var new_group = false;
		var grp = null;

		if (keyval in this.groups) {
			grp = this.groups[keyval];
		} else {
			grp = [];
			this.groups[keyval] = grp;

			// also store one representative
			this.representatives[keyval] = msg;

			new_group = true;
		}

		grp.push( msg );


		// now DOM building stuff
		// find existing group elemnt
		$group = $('.group', this.$main).filter(function(ix, elm) {
			return $(elm).data('group-key', keyval);
		});

		var b = new Build();
		if ($group.length == 0) {
			// create
			b.push_parent(this.$main);
			$group = b.div('group');
			b.push_parent($group);

				recipe.headfn( this.representatives[keyval], b.span('header') );
				var switcher = new Stack(this.build_message, $group);
				$group.data('group-switcher', switcher);

			b.pop_parent();
		} 

		// add item
		var switcher = $group.data('group-switcher');
		switcher.add_item(msg);

	}



};
