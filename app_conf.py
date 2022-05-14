import sys
import os
import configparser
import logger

# Appliction settings with default values

settings = {
	"log_level": "info",		# logger messaging level
	"log_to_console": False,	# permission for stdout log printing
	"log_files_dir": "./log",	# directory for storing rotated log files
	"log_max_size": 4,			# max size of log file [MB]
	"cnc_ini_path": "",			# path to ini file to run linuxcnc with
	"autologin": False,			# permission for ignoring authentication page
}

def try_to_set(root, name, value, is_boolean=False):
	try:
		if is_boolean:
			return root.getboolean(name)
		return root[name]
	except Exception:
		#logger.debug("'" + name + "' not found in config file. Using default: " + str(value))
		return value

def read_config(path):
	global settings

	config = configparser.ConfigParser()

	# Trying to read config file at determined path
	if config.read(path) == []:
		# Trying to read config file at /etc path
		if config.read("/etc/cnc_ui/cnc_ui.config") == []:
			return False

	# Parse necessary settings
	if "COMMON" in config:
		common = config["COMMON"]
		settings["log_level"] = try_to_set(common, "log_level", settings["log_level"])
		settings["log_to_console"] = try_to_set(common, "log_to_console", settings["log_to_console"])
		settings["log_files_dir"] = try_to_set(common, "log_files_dir", settings["log_files_dir"])
		settings["log_max_size"] = try_to_set(common, "log_max_size", settings["log_max_size"]) * 1048576	# MB -> Bytes

	if "LINUXCNC" in config:
		cnc_settings = config["LINUXCNC"]
		settings["cnc_ini_path"] = try_to_set(cnc_settings, "ini_path", settings["cnc_ini_path"])

	if "SERVER" in config:
		sever = config["SERVER"]
		settings["autologin"] = try_to_set(sever, "autologin", settings["autologin"], True)

	return True 	# Config file exists



if __name__ == "__main__":
	logger.init("debug", "log/app_conf.log")
	if read_config('app.config'):
		for key in settings:
			logger.debug( key + ": " + str(settings[key]) )
