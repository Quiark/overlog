import json
import time
import Json2Html
from yattag import Doc
import pprint

class Backend(Json2Html.Backend):
	def ProcessMessage(self, message):
		processedMessage = {"Stream":message["Stream"], "Info":message["Info"]}
		data = message["Data"]

		processedMessage['Data'] = self.MakeJson(data)
		processedMessage['JsonData'] = self.MakeJson(data)

		self._parentNode.SendMessage(processedMessage)

	def MakeJson(self, obj):
		return json.dumps(obj)

	def MakeHtml(self, obj):
		stack = obj['stack']
		_time = obj['time']

		data_printed = pprint.pformat(obj['data'])

		doc, tag, text = Doc().tagtext()
		with tag('div', klass='overlog_item'):
			with tag('div', klass='header'):
				with tag('span', klass='time'):
					text(time.ctime(_time))

				with tag('button', klass='stack_toggle'):
					text('stack V')

				with tag('button', klass='data_toggle'):
					text('data V')

				with tag('span', klass='pid'):
					text(str(obj['pid']))

			with tag('pre'):
				text(data_printed)

			with tag('ul', klass='stack'):
				for i in stack:
					with tag('li'):
						with tag('span', klass='filename'):
							text(i[0])

						with tag('span', klass='lineno'):
							text(u':' + unicode(i[1]))

						with tag('span', klass='function'):
							text(i[2])

						with tag('p', klass='codeline'):
							text(i[3])

		return doc.getvalue()
