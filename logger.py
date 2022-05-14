

import logging
from logging.handlers import RotatingFileHandler

# Shared for other modules object
# NOTE: logger.init() should be called before any usage
my_logger = None


class CustomRotatingFileHandler(RotatingFileHandler):
	def doRollover(self):
		super(CustomRotatingFileHandler, self).doRollover()
		#print("ROTATION HAS BEEN DONE")

class MyLogger():
	def __init__(self):
		self.formatter = logging.Formatter('%(asctime)s %(levelname)s %(message)s', 
											datefmt='[%d.%m %H:%M:%S]')
		self.level = logging.WARNING

		self.logger = logging.getLogger('my_logger')
		self.logger.setLevel(self.level)

		self.file_handler = None
		self.console_handler = None

		self.log_levels = { "debug" : logging.DEBUG, 
							"info" : logging.INFO,
							"warning" : logging.WARNING,
							"error" : logging.ERROR,
							"critical" : logging.CRITICAL,
		}

	def setup(self, level = "warning", file_path = "", file_max_size = 2*1048576, use_console = True):
		if self.log_levels.has_key(level):
			self.level = self.log_levels[level]

		if file_path:
			self.file_handler = CustomRotatingFileHandler(file_path, mode='a', maxBytes=file_max_size, 
											backupCount=5, encoding=None, delay=0)
			self.file_handler.setFormatter(self.formatter)
			self.file_handler.setLevel(self.level)
			self.logger.addHandler(self.file_handler)

		if use_console:
			self.console_handler = logging.StreamHandler()
			self.console_handler.setFormatter(self.formatter)
			self.console_handler.setLevel(self.level)
			self.logger.addHandler(self.console_handler)

		self.logger.setLevel(self.level)

# Common object for external modules
my_logger = MyLogger()

# Wraps of logging message methods to use as logger.method
def init(level = "warning", file_path = "", file_max_size = 2*1048576, use_console = True):
	my_logger.setup(level, file_path, file_max_size, use_console)

def debug(msg, *args, **kwargs):
	my_logger.logger.debug(msg, *args, **kwargs)

def info(msg, *args, **kwargs):
	my_logger.logger.info(msg, *args, **kwargs)

def warning(msg, *args, **kwargs):
	my_logger.logger.warning(msg, *args, **kwargs)

def error(msg, *args, **kwargs):
	my_logger.logger.error(msg, *args, **kwargs)

def critical(msg, *args, **kwargs):
	my_logger.logger.critical(msg, *args, **kwargs)

def exception(msg, *args, **kwargs):
	my_logger.logger.exception(msg, *args, **kwargs)

if __name__ == "__main__":
	init("debug", file_path="log/test.log", file_max_size=1024)
	my_logger.logger.debug('This is a debug message')
	my_logger.logger.info('This is an info message')
	my_logger.logger.warning('This is a warning message')
	my_logger.logger.error('This is an error message')
	my_logger.logger.critical('This is a critical message')