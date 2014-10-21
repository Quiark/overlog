var CHARCODE_A = 97;
var CHARCODE_D = 101;

SocketClient = {
	server_name: 'ws:/'+ location.host +'/WebSockets/',
	reconnectingTimer : undefined,
	paused : false,

	Connect : function(){
		var self = this;
		console.log('Connectiong to WS at ', this.server_name);

		var ws = new WebSocket(this.server_name);
		ws.onmessage = this.on_message;
		ws.onclose = function() { 
			$("#bottom-information-panel").html("Disconnected. Waiting 1 second before reconnecting...");
			self.reconnectingTimer = setInterval("javascript:SocketClient.Reconnect()", 1000);
		};
		ws.onopen = function(){ 
			$("#bottom-information-panel").html("Connected.");
		};
	},

	Reconnect : function(){
		$("#bottom-information-panel").html("Disconnected. Reconnecting...");
		this.Connect();
		clearInterval(this.reconnectingTimer);
	},

	FreezeConsole:function(){
		$("#FreezeButton").html(this.paused?"Pause":"Run");
		this.paused = !this.paused;
	},

	on_message: function(evt) {
		if (this.paused) return;

		var message = JSON.parse(evt.data);
		OverlogBoard.add_message(message);

	}
};


///////////////////////////////////////////////////////////////////////////////////////////

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
	if (kls) {
		var parts = kls.split('.');
		for (var i = 0; i < parts.length; i++)
			elem.addClass(parts[i]);
	}
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

/*
 * owner: some top-level object which coordinates behaviour of this
 *		dump. Currently for keeping track of open branches
 */
Build.prototype.dumpobj = function(indent, obj, $_parent, owner, path) {
	this.push_parent($_parent);
	var self = this;

	// get metadata
	var __class = obj.__class;
	if (__class != undefined) {
		// is extended, go inside
		obj = obj.__data;
	}

	if (__class == 'FrameDump') {
		this.dump_FrameDump(indent, obj, $_parent, owner, path);
		return;
	}

	for (var key in obj) {
		var val = obj[key];

		var $line = this.div('line').attr('data-key', key);
		this.push_parent($line);

		var $collapse = this.span('button').addClass('collapse').text('+');
		var $name = this.span('name.kd').text(key);
		$line.css('padding-left', indent * 20 + 'px');

		if (typeof(val) != 'object') {
			var $val = this.span('value.l').text(val);
			$collapse.text(' ').addClass('disabled');
			this.pop_parent();

		} else {
			// just a simple text
			var $val = this.span('value.kt').text(self.print_object_summary(val));
			this.pop_parent();

			// nested value is next div
			var $sub = this.div('nested').attr('data-key', key);
			var full_path = path.concat([key]);
			var node = new DumpNode(key, val, owner, $sub, indent, full_path, self, $collapse);
			$sub.data('node', node);
			$sub.data('val-expanded', false);
			this.push_parent($sub);

			$collapse.data('$sub', $sub);
			$collapse.click(function(evt) {
				var $sub = $(this).data('$sub');
				var node = $sub.data('node');

				node.expand(true);
			});

			$sub.toggle(); // invisible by default

			this.pop_parent();
		}
	}

	this.pop_parent();
}


Build.prototype.print_object_summary = function(val) {
	var res = '[...]';
	if (val && val.__class) {
		res += ' is ' + val.__class;
	}
	if (val && val.__id) {
		res += '@' + val.__id.toString(16);
	}
	return res;
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

Build.prototype.dump_FrameDump = function(indent, obj, $parent, owner, path) {
	var self = this;
	this.push_parent($parent);

	this.span('button').text('src').click(function(evt) {
		jQuery.post('/getsrc/', JSON.stringify(obj.position), function(data) {
			self.push_parent($parent);
			self.elem('pre', 'source').text( data );
			self.pop_parent();
		});
	});

	this.dumpobj(indent, obj.position, this.div('c'), owner, path);
	this.dumpobj(indent, obj.localvars, $parent, owner, path);

	this.pop_parent();
}

///////////////////////////////////////////////////////////////////////////////////////////
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

	this.opened = {};
}

Stack.prototype.add_item = function(val) {
	// array only
	this.items.push(val);
	var key = this.items.length -1;

	var self = this;

	var b = new Build();
	b.set_parent(this.$choices);
	var $elem = b.elem('button', 'button').text(key).attr('data-sel', key);
	$elem.click(function(evt) {
		self.do_switch($(this).attr('data-sel'));
	});
	$elem.keypress(function(evt) {
		var current = parseInt( $(this).attr('data-sel') );
		if (evt.charCode == CHARCODE_A) self.do_switch(current - 1, null);
		else if (evt.charCode == CHARCODE_D) self.do_switch(current + 1, null);
	});

	if (key == 0) {
		this.do_switch(key, $elem);
	}
};

Stack.prototype.do_switch = function(key, $elem) {
	if ((key < 0) || (key >= this.items.length)) return;

	// adjust GUI
	if ($elem == null) $elem = $('.button[data-sel="'+key+'"]', this.$choices);
	$('.button', this.$choices).removeClass('down');
	$elem.addClass('down');
	$elem.focus();

	// change data
	var item = this.items[key];
	this.$container.empty();

	this.builder( this, item, this.$container );

	this.reopen( this.opened, $('.msg .data', this.$container) );
}


Stack.prototype.reopen = function(opened_struct, $container) {
	for (var k in opened_struct) {
		var $elem = $('.nested[data-key='+k+']', $container);
		var node = $elem.data('node');

		node.expand(false);
		this.reopen( opened_struct[k], $elem );
	}
}

///////////////////////////////////////////////////////////////////////////////////////////
function DumpNode(key, val, owner, $sub, indent, full_path, build, $collapse) {
	this.key = key;
	this.val = val;
	this.owner = owner;
	this.$sub = $sub;
	this.indent = indent;
	this.full_path = full_path;
	this.build = build;
	this.$collapse = $collapse;

	this.expanded = false;
}

DumpNode.prototype.expand = function(slide) {
	if (slide == undefined) slide = true;

	if (!this.$sub.data('val-expanded')) {
		this.build.dumpobj(this.indent + 1, this.val, this.$sub, this.owner, this.full_path);
		this.$sub.data('val-expanded', true);
	}

	if (slide){ 
		this.$sub.slideToggle(100);
	} else {
		this.$sub.toggle();
	}
	this.do_expand();
}

DumpNode.prototype.do_expand = function() {
	var $btn = this.$collapse;
	var opened;
	if ($btn.text() == '+') {
		$btn.text('-');
		opened = true;
	} else {
		$btn.text('+');
		opened = false;
	}

	var opnode = this.owner.opened;
	for (var i = 0; i < this.full_path.length; i++) {
		var k = this.full_path[i];
		if ((k in opnode) && !opened && (i == this.full_path.length - 1)) {
			delete opnode[k];
		} else if (!(k in opnode) && opened) {
			opnode = opnode[k] = {};
		} else {
			// just go in
			opnode = opnode[k];
		}
	}
}

///////////////////////////////////////////////////////////////////////////////////////////
ControlPanel = function($parent, overlog) {
	this.$parent = $parent;
	this.overlog = overlog;
	var self = this;

	this.b = new Build();
	this.b.push_parent(this.$parent);
	this.$grouping = this.b.div('grouping');
	this.b.push_parent( this.$grouping );

	$('.control_panel h2').click(function(evt) {
		$('.control_panel .content').slideToggle();
	});

	$.each(this.overlog.group_recipes, function(ix, elm) {
		self.b.div('button').text(ix).click(function(evt) {
			$(this).toggleClass('down');

			self.refresh();
		});
	});

	// PID filter
	this.b.pop_parent();
	this.$pid_filter = this.b.elem('ol', 'PID_filter').addClass('selectable');
	this.$pid_filter.selectable({
		stop: function() {
			var pids = self.get_selected_items(this, 'data-pid');
			self.overlog.set_filter('pid', pids );
			self.refresh();
		}
	});


	// mode filter
	this.$mode_filter = this.b.elem('ol', 'mode_filter').addClass('selectable');
	this.b.push_parent(this.$mode_filter);
	['data', 'tracer', 'method decorator', 'loc', 'exc_tracer'].every(function(i) {
		self.b.elem('li').attr('data-mode', i).text(i);
		return true;
	});
	this.b.pop_parent();

	this.$mode_filter.selectable({
		stop: function() {
			self.overlog.set_filter('mode', self.get_selected_items(this, 'data-mode'));
			self.refresh();
		}
	});

	// RPC commands
	this.$rpc_commands = this.b.div('rpc_commands');
	this.b.push_parent( this.$rpc_commands );

	this.$rpc_fornew = this.b.span('button.blockize').text('For new processes');
	this.$rpc_fornew.click(function(evt) {
		$(this).toggleClass('down');
	});

	this.b.span('button.blockize').text('Trace exceptions').click(function(evt) {
		self.send_rpc('trace_except', []);
	});

	var $do_exec_btn = this.b.span('button.blockize').text('Exec');
	this.b.pop_parent();

	this.$exec_box = this.b.elem('textarea', 'exec_box')
		.attr('type', 'textarea')
		.attr('placeholder', 'code to execuate...')
		.attr('rows', '4')
		.attr('cols', 60);
	
	$do_exec_btn.click(function(evt) {
		self.send_rpc('do_exec', [self.$exec_box.val()]);
	});

}

ControlPanel.prototype.get_selected_items = function($container, attr) {
	return $.makeArray(
			$('.ui-selected', $container).map(function(ix, elm) { return $(elm).attr(attr); })
	);
}

ControlPanel.prototype.send_rpc = function(method, params) {
	var pid;
	if (this.$rpc_fornew.hasClass('down')) {
		pid = 'new';
	} else {
		var pid_selected = this.overlog.state.filters['pid'].selected;
		if (pid_selected.length == 0) return;
		pid = pid_selected[0];
	}

	var obj = {method: method, pid: pid, params: params, id: null};
	jQuery.ajax('/rpc/', {
		type: 'POST',
		dataType: 'json',
		data: JSON.stringify(obj)
	});
}

ControlPanel.prototype.refresh = function() {
	var choices = $('.button.down', this.$grouping).map(function(ix, elm) {return $(elm).text(); });
	OverlogBoard.regroup_by(choices);
}

ControlPanel.prototype.on_msg = function(msg) {
	var pid = msg.pid;
	var $found = $('li[data-pid='+pid+']', this.$pid_filter);

	if ($found.length == 0) {
		$('<li/>').attr('data-pid', pid).text(pid).appendTo(this.$pid_filter);
	}
}


///////////////////////////////////////////////////////////////////////////////////////////
OverlogBoard = {
	init: function($elem) {
		this.$main = $elem;
		this.all_data = [];

		this.group_recipes = {
			pid: {
				keyfn: function(val) { return val.pid; },
				elm_attr: 'data-pid',
				headfn: function(val, $header) { $header.text('pid:' + val.pid); }
			},
			caller: {
				keyfn: function(val) { return val.caller.hash; },
				elm_attr: 'data-caller',
				headfn: function(val, $header) {
						$header.text('caller:' + val.caller.name + ':' + val.caller.lineno);
				}
			},
			thread: {
				keyfn: function(val) { return val.thread.id; },
				elm_attr: 'data-thread',
				headfn: function(val, $header) { $header.text('thread: ' + val.thread.name); }
			}
		};

		this.state = {
			grouping: ['caller'],
			filters: {}
		};

		this.groups = {};
		this.representatives = {};


		$(document).on('click', 'div.msg  .stack_toggle', function(evt) {
			$('.stack', $(this).parent().parent()).toggle();
		});

		$(document).on('click', '#test-button', function(evt) {
			OverlogBoard.test();
		});

		this.active_msg_btn('size_toggle', function($btn, $msg) {
			$msg.toggleClass('smallmsg');
		});

		this.control = new ControlPanel($('.control_panel .content', this.$main.parent()), this);

	},

	active_msg_btn: function(cls, handler) {
		var self = this;
		$(document).on('click', 'div.msg  .'+cls, function(evt) {
			handler( $(this), $(this).parent().parent() );
		});

	},

	clear: function() {
		this.$main.empty();
	},

	add_message: function(msg) {
		this.all_data.push(msg);
		this.add_by_group(msg);
		this.control.on_msg(msg);
	},

	build_message: function(stack, msg, $parent) {
		var b = new Build();
		var $msg = b.div('msg.hi').appendTo($parent);
		$msg.data('msg', msg);
		$msg.data('stack', stack);

		var time = new Date();
		time.setTime(msg.time * 1000);

		$msg.attr('data-pid', msg.pid);
		//$msg.draggable({ containment: "parent", handle: ".header" });
		b.push_parent($msg);

		b.push_parent( b.div('header') );
		b.span().text('PID: ');
		b.span('pid').text(msg.pid);
		b.span().text('THR: ');
		b.span('thr').text(msg.thread.name);
		b.span().text('mode: ');
		b.span('mode').text(msg.mode);
		b.span().text('time: ');
		b.span('time').text(time.toString());
		var $tog_stack = b.span('stack_toggle').addClass('button').text('+ stack');
		b.span('size_toggle').addClass('button').text('+ enlarge');
		b.pop_parent();

		b.dumpstack(msg.stack, b.div('stack').css('display', 'none'));
		b.set_parent($msg);
		b.dumpobj(0, msg.data, b.div('data'), stack, []);

		try {
			b.set_parent($msg);
			b.dumpobj(0, msg.caller, b.div('caller'), null, []);
			$msg.attr('data-caller', msg.caller.hash);
		} catch (e) { };

	},

	test: function() {
		var obj = {k: 'hello', l: 'world'};
		var pids = [111, 222, 333];

		for (i = 0; i < 3; i++) {
			var obj = {"thread": {"name": "pepa", "ident": 111}, "caller": {"hash": 123}, "pid": rnd_choose(pids), "data": {"added_files": ["C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\inc_testfile_f0m38t.txt"], "backup_files": ["5F528261B1B115E985DC32F043805699C0689D12"], "bdetails": {"clientid": ["2Topinka's Windows-7-6.1.7600-124191492294245", "test_6513"], "snapshot_id": 1402310939922}, "self": {"test": {"src_provider": {"testcase": "<object \"test_incremental (app.BackupTest)\" already seen before>", "path": "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb", "incr_added": "<object \"['C:\\\\Devel\\\\PyBrowser\\\\SnowBox\\\\projects\\\\DesktopClient\\\\tests\\\\tstdata\\\\sd_c8qjgb\\\\inc_testfile_f0\" already seen before>", "to_delete": ["<object \"C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\inc_testfile_f0m38t.txt\" already seen before>"]}, "_testMethodName": "test_incremental", "_diffThreshold": 65536, "_resultForDoCleanups": "<object \"{'__module__': 'nose.proxy', '__str__': <method-wrapper '__str__' of ResultProxy object at 0x0389171\" already seen before>", "app": "<object \"{'__module__': 'snowclient', 'on_exception': <bound method SnowApp.on_exception of <snowclient.SnowA\" already seen before>", "factory": "<object \"{'__module__': 'app', '__format__': <built-in method __format__ of TestAppFactory object at 0x038918\" already seen before>", "somefiles": ["C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sf_4k0q8y", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sf_v0mon4", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sf_dn1fck", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sd_p6bn0w\\sf_tiu70b", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sd_p6bn0w\\sf_45a63q", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sd_p6bn0w\\sf_jzknts", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sd_odpeg4\\sf_zhk0p2", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sd_odpeg4\\sf_xwav1r", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sd_odpeg4\\sf_hq1olj", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sd_2i948j\\sf_xi6gwc", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sd_2i948j\\sf_eqbjxc", "C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\tstdata\\sd_c8qjgb\\sd_2i948j\\sf_n8ujoh"], "_cleanups": [], "_type_equality_funcs": {"<type 'list'>": "assertListEqual", "<type 'set'>": "assertSetEqual", "<type 'frozenset'>": "<object \"assertSetEqual\" already seen before>", "<type 'unicode'>": "assertMultiLineEqual", "<type 'dict'>": "assertDictEqual", "<type 'tuple'>": "assertTupleEqual"}, "longMessage": true, "failureException": {"message": {}, "args": "<object \"{'__setattr__': <method-wrapper '__setattr__' of getset_descriptor object at 0x003B8210>, '__reduce_\" already seen before>"}, "maxDiff": 640, "chkstorage": "<object \"<app.LocalStorageChecker object at 0x038917F0>\" already seen before>", "_testMethodDoc": "<object \"{'__setattr__': <method-wrapper '__setattr__' of NoneType object at 0x1E222C0C>, '__reduce_ex__': <b\" already seen before>", "_classSetupFailed": false, "backup_details": "<object \"{'clientid': ClientId(device=\"2Topinka's Windows-7-6.1.7600-124191492294245\", username='test_6513'),\" already seen before>"}, "base_path": "c:\\Temp\\BoxServer\\NewStore"}}, "stack": [["C:\\Software\\cmdline\\nosetests-script.py", 9, "<module>", "load_entry_point('nose==1.3.3', 'console_scripts', 'nosetests')()"], ["C:\\Devel\\Python\\lib\\site-packages\\nose-1.3.3-py2.7.egg\\nose\\core.py", 121, "__init__", "**extra_args)"], ["C:\\Devel\\Python\\lib\\unittest\\main.py", 95, "__init__", "self.runTests()"], ["C:\\Devel\\Python\\lib\\site-packages\\nose-1.3.3-py2.7.egg\\nose\\core.py", 207, "runTests", "result = self.testRunner.run(self.test)"], ["C:\\Devel\\Python\\lib\\site-packages\\nose-1.3.3-py2.7.egg\\nose\\core.py", 62, "run", "test(result)"], ["C:\\Devel\\Python\\lib\\site-packages\\nose-1.3.3-py2.7.egg\\nose\\suite.py", 176, "__call__", "return self.run(*arg, **kw)"], ["C:\\Devel\\Python\\lib\\site-packages\\nose-1.3.3-py2.7.egg\\nose\\suite.py", 223, "run", "test(orig)"], ["C:\\Devel\\Python\\lib\\site-packages\\nose-1.3.3-py2.7.egg\\nose\\suite.py", 176, "__call__", "return self.run(*arg, **kw)"], ["C:\\Devel\\Python\\lib\\site-packages\\nose-1.3.3-py2.7.egg\\nose\\suite.py", 223, "run", "test(orig)"], ["C:\\Devel\\Python\\lib\\site-packages\\nose-1.3.3-py2.7.egg\\nose\\case.py", 45, "__call__", "return self.run(*arg, **kwarg)"], ["C:\\Devel\\Python\\lib\\site-packages\\nose-1.3.3-py2.7.egg\\nose\\case.py", 133, "run", "self.runTest(result)"], ["C:\\Devel\\Python\\lib\\site-packages\\nose-1.3.3-py2.7.egg\\nose\\case.py", 151, "runTest", "test(result)"], ["C:\\Devel\\Python\\lib\\unittest\\case.py", 395, "__call__", "return self.run(*args, **kwds)"], ["C:\\Devel\\Python\\lib\\unittest\\case.py", 331, "run", "testMethod()"], ["C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\app.py", 395, "test_incremental", "self.chkstorage.check_incremental(self.src_provider.incr_added, self.backup_details)"], ["C:\\Devel\\PyBrowser\\SnowBox\\projects\\DesktopClient\\tests\\app.py", 140, "check_incremental", "OLOG.loc(locals())"], ["C:\\Devel\\Python\\lib\\site-packages\\overlog-0.1\\overlog.py", 164, "loc", "self.send_data(loc)"]], "time": 1402310940.321};
			this.add_by_group(obj);
		}

	},


	add_by_group: function(msg) {
		// already added to all_data, now just adjust grouping
		var self = this;

		// consider filter
		for (var key in this.state.filters) {
		//for (var i = 0; i < this.state.filters.length; i++) {
			var cur_f = this.state.filters[key];
			if ($.inArray( msg[ cur_f.field ].toString(), cur_f.selected) == -1) return;
		}

		// build total_keyval, containing keyval for each selected grouping
		var total_keyval = [];
		for (var grkey = 0; grkey < this.state.grouping.length; grkey++) {
			var gr = this.state.grouping[grkey];

			var recipe = this.group_recipes[gr];

			var keyval = recipe.keyfn(msg);
			total_keyval.push( keyval );
		}

		var keyval = total_keyval.join('##');

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
			return $(elm).data('group-key') == keyval;
		});

		var b = new Build();
		if ($group.length == 0) {
			// create
			b.push_parent(this.$main);
			$group = b.div('group');
			$group.data('group-key', keyval);
			b.push_parent($group);

				$.each(this.state.grouping, function(ix, elm) {
					var recipe = self.group_recipes[elm];

					recipe.headfn( self.representatives[keyval], b.span('header') );
				});

				
				var switcher = new Stack(this.build_message, $group);
				$group.data('group-switcher', switcher);

			b.pop_parent();
		} 

		// add item
		var switcher = $group.data('group-switcher');
		switcher.add_item(msg);

	},

	regroup_by: function(grouping) {
		this.state.grouping = grouping;
		var self = this;

		this.clear();
		$.each(this.all_data, function(ix, elm) {
			self.add_by_group(elm);
		});
	},

	set_filter: function(field, selected) {
		this.state.filters[field] = {
			field: field,
			selected: selected
		};
	}
};

///////////////////////////////////////////////////////////////////////////////////////////

$(document).ready(function() {
	OverlogBoard.init($('#messages'));
	SocketClient.Connect();
});
