from distutils.core import setup

setup(
	name='Overlog',
	version='0.1.0',
	author='Roman Plasil',
	author_email='me@rplasil.name',
	packages=['overlog'],
	scripts=[],
	url='http://github.com/Quiark/overlog',
	license='LICENSE.txt',
	description='',
	long_description=open('README.md').read(),
	install_requires=[
		'tornado >= 3.1.1'
	],
)
