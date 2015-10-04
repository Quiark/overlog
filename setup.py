from distutils.core import setup

setup(
	name='Overlog',
	version='0.2.0',
	author='Roman Plasil',
	author_email='me@rplasil.name',
	packages=['overlog'],
	scripts=[],
	url='http://github.com/Quiark/overlog',
	license='LICENSE.txt',
	description='Increase your debugging and development productivity by loging copious amounts of data!',
	include_package_data=True,
	long_description=open('README.md').read(),
	install_requires=[
		'tornado >= 3.1.1'
	],
)
