var CHARCODE_A = 97;
var CHARCODE_D = 101;

/* TODO
	* grouping by custom path
	* button to pin selected objects to separate dashboard
*/

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
			self.reconnectingTimer = setInterval(() => SocketClient.Reconnect(), 1000);
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

	on_message: function(evt) {
		if (evt.data[0] == '#') {
			var dat = evt.data.substr(1);
			var message = JSON.parse(dat);

			if (message.__control == 'set_cwd') {
				OverlogBoard.control.set_cwd_ctl(message);
			}
		} else {
			var message = JSON.parse(evt.data);
			OverlogBoard.add_message(message);
		}
	}

};

function simkey() {
	var keyboardEvent = document.createEvent('KeyboardEvent');
	var initMethod = typeof keyboardEvent.initKeyboardEvent !== 'undefined' ? 'initKeyboardEvent' : 'initKeyEvent';

	keyboardEvent[initMethod](
		'keydown', // event type: keydown, keyup, keypress
		true, // bubbles
		true, // cancelable
		window, // view: should be window
		false, // ctrlKey
		false, // altKey
		false, // shiftKey
		false, // metaKey
		9, // keyCode: unsigned long - the virtual key code, else 0
		0, // charCode: unsigned long - the Unicode character associated with the depressed key, else 0
	);
	document.dispatchEvent(keyboardEvent);
}

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

		var $line = this.div('line').attr('data-key', key).attr('tabindex', 0);
		this.push_parent($line);

		var $collapse = this.span(); //'button').addClass('collapse').text('+');
		var $name = this.span('name.kd').text(key);
		$line.css('padding-left', indent * 20 + 'px');

		if ((val != null) && (typeof(val) != 'object')) {
			var $val = this.span('value.l').text(val);
			//$collapse.text(' ').addClass('disabled');
			$collapse.addClass('indent').text(' ');
			//var $stick = this.span('stick').addClass('button').text('+');
			//$stick.click(stickFn);
			this.pop_parent();

		} else {
			// just a simple text
			var $val = this.span('value.kt').text(self.print_object_summary(val));
			var $stick = this.span('stick').addClass('button').text('+');
			$stick.click(function(evt) {
				evt.stopPropagation();
				var $sub = $(this).data('$sub');
				var node = $sub.data('node');

				var box = $(addWhiteboardBox());
				OverlogBoard.build_message({}, {
					stack: [],
					data: node.val
				}, box)
				box.get(0).scrollIntoView()
			}
			);
			this.pop_parent();

			// nested value is next div
			var $sub = this.div('nested').attr('data-key', key)
			var full_path = path.concat([key]);
			var node = new DumpNode(key, val, owner, $sub, indent, full_path, self, $collapse);
			$sub.data('node', node);
			$sub.data('val-expanded', false);
			$stick.data('$sub', $sub);
			this.push_parent($sub);

			$collapse.addClass('button').addClass('collapse').text('+');
			$collapse.data('$sub', $sub);
			$collapse.click(function(evt) {
				evt.stopPropagation();
				var $sub = $(this).data('$sub');
				var node = $sub.data('node');

				node.expand(true);
			});

			var lineClickFn = function(evt) {
				var $sub = $('.collapse', this).data('$sub');
				var node = $sub.data('node');
				node.expand(true);
			};
			$line.click(lineClickFn);
			$line.keydown(function(evt) {
				if (evt.key == ' ') {
					lineClickFn.call(this, evt);
				} else if (evt.key == 'j') {
					simkey()
				}
			});

			$sub.toggle(); // invisible by default

			this.pop_parent();
		}
	}

	this.pop_parent();
}


Build.prototype.print_object_summary = function(val) {
	if (val == null) return 'Null';
	if (val?.length === 0) return '[]';
	if (Object.keys(val)?.length === 0) return '{}';
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
		var $src_btn = $(this);
		var $source = $('.source', $parent);

		if ($source.length == 0) {
			jQuery.post('/getsrc/', JSON.stringify(obj.position), function(data) {
				var $source = $('<pre />').addClass('source').text( data );	
				$src_btn.after($source);
			});
		} else {
			// just toggle
			$source.toggle();
		}
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
	if (owner == null) console.warn('DumpNode: owner is null');
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
	this.b.span().text('Group by:');
	this.$grouping = this.b.div('grouping');
	this.b.push_parent( this.$grouping );

	$('.control_panel h2').click(function(evt) {
		$('.control_panel .content').slideToggle(100);
	});

	$.each(this.overlog.group_recipes, function(ix, elm) {
		self.b.div('button').text(ix).click(function(evt) {
			$(this).toggleClass('down');

			self.refresh();
		});
	});


	this.$customPathInput = this.b.elem('input', 'custom-path-input')
		.attr('type', 'text')
		.attr('placeholder', 'Enter custom path')
		.addClass('custom-path-input')

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

	// tags filter
	this.$tags_filter = this.b.elem('ol', 'tags_filter').addClass('selectable');
	this.b.push_parent(this.$tags_filter);
	this.b.pop_parent();

	this.$tags_filter.selectable({

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
	OverlogBoard.customPath = $('.custom-path-input').val();
	OverlogBoard.regroup_by(choices);
}

ControlPanel.prototype.add_pid = function(pid) {
	var $found = $('li[data-pid='+pid+']', this.$pid_filter);

	if ($found.length == 0) {
		console.log('appending PID');
		return $('<li/>').attr('data-pid', pid).text(pid).appendTo(this.$pid_filter);
	} else {
		return $found;
	}
}

ControlPanel.prototype.on_msg = function(msg) {
	this.add_pid(msg.pid);
}

ControlPanel.prototype.set_cwd_ctl = function(dat) {
	console.log('set_cwd_ctl', dat);
	var $found = this.add_pid(dat.pid);
	$('<div/>').addClass('subtitle').text(dat.argv).appendTo($found);
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
			},
			custom: {
                keyfn: function(val) { return _.get(val.data, OverlogBoard.customPath); },
                elm_attr: 'data-custom',
                headfn: function(val, $header) { $header.text(OverlogBoard.customPath?.toString() + ': ' + _.get(val.data, OverlogBoard.customPath)); }
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
		if (msg.pid || msg.thread || msg.time) {
			b.span().text('PID: ');
			b.span('pid').text(msg.pid);
			b.span().text('THR: ');
			b.span('thr').text(msg.thread?.name);
			b.span().text('mode: ');
			b.span('mode').text(msg.mode);
			b.span().text('time: ');
			b.span('time').text(time.toString());
			b.span().text('counter: ');
			b.span('counter').text(msg.counter);
		}
		var $tog_stack = b.span('stack_toggle').addClass('button').text('+ stack');
		//var $stick = b.span('stick').addClass('button').text('[+]');
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
		this.all_data.sort((a, b) => {
			return (a.count ?? 0) - (b.count ?? 0);
		})
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

// Tab switching functionality
function initTabs() {
    $('.tab-button').click(function() {
        $('.tab-button').removeClass('active');
        $('.tab-pane').removeClass('active');
        
        $(this).addClass('active');
        const tabId = $(this).data('tab');
        
        if (tabId === 'main') {
            $('#main-view').addClass('active');
        } else if (tabId === 'whiteboard') {
            $('#whiteboard-view').addClass('active');
            initWhiteboard();
            if (latestWhiteboardBox) {
                latestWhiteboardBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else if (tabId === 'latest') {
            $('#main-view').addClass('active');
            $('.tab-button[data-tab="main"]').addClass('active');
            window.scrollTo({top: 0, behavior: 'smooth'});
            
            // Select the last PID in the filter
            const $pidFilter = $('.PID_filter');
            const $lastPid = $('li[data-pid]', $pidFilter).last();
            if ($lastPid.length) {
                $('.ui-selected', $pidFilter).removeClass('ui-selected');
                $lastPid.addClass('ui-selected');
                // Trigger the filter update
                const pids = OverlogBoard.control.get_selected_items($pidFilter[0], 'data-pid');
                OverlogBoard.set_filter('pid', pids);
                OverlogBoard.control.refresh();
            }
        }
    });
}

// Whiteboard functionality
function initWhiteboard() {
    const whiteboardContent = document.querySelector('.whiteboard-content');
    if (!whiteboardContent.initialized) {
        whiteboardContent.initialized = true;

        // Initialize Clear button
        document.getElementById('clear-whiteboard').addEventListener('click', function() {
            const boxes = whiteboardContent.querySelectorAll('.whiteboard-box');
            boxes.forEach(box => box.remove());
        });

        // Initialize Diff button
        document.getElementById('diff-whiteboard').addEventListener('click', function() {
            const boxes = whiteboardContent.querySelectorAll('.whiteboard-box');
            if (boxes.length >= 2) {
                const box1 = boxes[0];
                const box2 = boxes[1];
                
                // Get the data from the boxes
				const pick = (e) => $(e.children[0]).data('msg')?.data
                const data1 = pick(box1);
                const data2 = pick(box2);
                
                if (data1 && data2) {
                    // Create new box with diff
                    const diffBox = addWhiteboardBox();
                    const diffData = {
                        data: recursiveDiff(data1, data2),
                        stack: [],
                        time: Date.now() / 1000
                    };

                    OverlogBoard.build_message({}, diffData, $(diffBox));
                }
            }
        });
        
        // Set canvas size
        const canvas = document.getElementById('whiteboard');
        function resizeCanvas() {
            canvas.width = whiteboardContent.clientWidth;
            canvas.height = whiteboardContent.clientHeight;
        }
        resizeCanvas();
        
        // Center the view initially
        const container = document.querySelector('.whiteboard-container');
        container.scrollLeft = (whiteboardContent.clientWidth - container.clientWidth) / 2;
        container.scrollTop = (whiteboardContent.clientHeight - container.clientHeight) / 2;

        // Initialize drawing
        let drawing = false;
        let lastX = 0;
        let lastY = 0;

        const ctx = canvas.getContext('2d');
        
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);

        function startDrawing(e) {
            drawing = true;
            [lastX, lastY] = [e.offsetX, e.offsetY];
        }

        function draw(e) {
            if (!drawing) return;
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(e.offsetX, e.offsetY);
            ctx.stroke();
            [lastX, lastY] = [e.offsetX, e.offsetY];
        }

        function stopDrawing() {
            drawing = false;
        }

        // Make boxes draggable
        whiteboardContent.addEventListener('mousedown', function(e) {
            if (e.target.classList.contains('whiteboard-box')) {
                const box = e.target;
                let startX = e.clientX - box.offsetLeft;
                let startY = e.clientY - box.offsetTop;
                
                function moveBox(e) {
					const step = 32
					let l = (e.clientX - startX)
					l -= l % step
					let t = (e.clientY - startY)
					t -= t % step
                    box.style.left = l + 'px';
                    box.style.top = t + 'px';
                }
                
                function stopMoving() {
                    document.removeEventListener('mousemove', moveBox);
                    document.removeEventListener('mouseup', stopMoving);
                }
                
                document.addEventListener('mousemove', moveBox);
                document.addEventListener('mouseup', stopMoving);
            }
        });
    }
}

// Function to add a new box to the whiteboard
let latestWhiteboardBox = null;

function addWhiteboardBox(x, y) {
    const whiteboardContent = document.querySelector('.whiteboard-content');
    const box = document.createElement('div');
    box.className = 'whiteboard-box';
    box.style.left = (x || Math.random() * (whiteboardContent.clientWidth) + 400) + 'px';
    box.style.top = (y || Math.random() * (whiteboardContent.clientHeight) + 400) + 'px';
    whiteboardContent.appendChild(box);
    latestWhiteboardBox = box;
    return box;
}

function recursiveDiff(obj1, obj2) {
    if (obj1 === obj2) return null;
    
    if (typeof obj1 !== typeof obj2) {
        return { old: obj1, new: obj2 };
    }
    
    if (typeof obj1 !== 'object' || obj1 === null || obj2 === null) {
        return { old: obj1, new: obj2 };
    }
    
    if (Array.isArray(obj1) !== Array.isArray(obj2)) {
        return { old: obj1, new: obj2 };
    }
    
    const diff = {};
    
    // Handle arrays
    if (Array.isArray(obj1)) {
        const maxLen = Math.max(obj1.length, obj2.length);
        const arrayDiff = [];
        for (let i = 0; i < maxLen; i++) {
            const d = recursiveDiff(obj1[i], obj2[i]);
            if (d !== null) arrayDiff[i] = d;
        }
        return arrayDiff.length > 0 ? arrayDiff : null;
    }
    
    // Handle objects
    for (const key in obj1) {
        if (!(key in obj2)) {
            diff[key] = { old: obj1[key], new: undefined };
            continue;
        }
        
        const d = recursiveDiff(obj1[key], obj2[key]);
        if (d !== null) diff[key] = d;
    }
    
    for (const key in obj2) {
        if (!(key in obj1)) {
            diff[key] = { old: undefined, new: obj2[key] };
        }
    }
    
    return Object.keys(diff).length > 0 ? diff : null;
}

$(document).ready(function() {
    OverlogBoard.init($('#messages'));
    SocketClient.Connect();
    initTabs();
});
