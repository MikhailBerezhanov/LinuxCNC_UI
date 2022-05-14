#!/usr/bin/python 
# -*- coding: utf-8 -*-

# *****************************************************
# *****************************************************
# WebServer Interface for LinuxCNC system
#
# Usage: app.py <LinuxCNC_INI_file_name>
#
# Provides a web server using normal HTTP/HTTPS communication
# to information about the running LinuxCNC system.  Most
# data is transferred to and from the server over a
# WebSocket using JSON formatted commands and replies.
#
#
# ***************************************************** 
# *****************************************************
#
# 
#

from __future__ import print_function

import sys
import os
import socket
import json

import tornado.web
import tornado.websocket
from tornado.httpserver import HTTPServer
from tornado.options import define, options
from tornado.ioloop import IOLoop

import app_db
from app_conf import read_config, settings
import utils
import cnc_agent
import logger
import logging

APP_VERSION = "1.2.0"

define('port', default=8888, help='port to listen on')

cnc_status_poll_period_ms = 500
cnc_error_poll_period_ms = 25

# Application global variables
cnc = None			# linuxcnc agent object
db = None			# sqlite database object 
logged_in = False	#


# 
class CurrentStatusSender():
	def __init__(self, WebSocketHandler):
		self.ws = WebSocketHandler
		self.prev_status = None

	def send(self, status):
		message_json = json.dumps(cnc_agent.LinuxCNCWorker.current_status_to_response(status))
		self.ws.write_message(message_json)

#
class CurrentErrorsSender():
	def __init__(self, WebSocketHandler):
		self.ws = WebSocketHandler

	def send(self, error):
		message_json = json.dumps(error)
		logger.debug("CNC Error :" + message_json)
		try:
			self.ws.write_message(error)
		except Exception as ex:
			logger.exception(ex)
		

# Handler for web-socket requests
class WebSocketHandler(tornado.websocket.WebSocketHandler):
	def __init__(self, *args, **kwargs):
		super(WebSocketHandler, self).__init__( *args, **kwargs )
		logger.debug("New websocket Connection...")
		self.status_sender = CurrentStatusSender(self)
		self.errors_sender = CurrentErrorsSender(self)
		self.subprotocol = None

	def open(self, arg):
		self.stream.socket.setsockopt( socket.IPPROTO_TCP, socket.TCP_NODELAY, 1 )

	def on_close(self):
		logger.debug("WebSocket (%s) closed" % self.subprotocol)
		# Remove corresponding observer
		if(self.subprotocol == "linuxcnc_status"):
			cnc.del_status_observer(self.status_sender.send)

		if(self.subprotocol == "linuxcnc_errors"):
			cnc.del_errors_observer(self.errors_sender.send)

	def on_message(self, message): 
		logger.debug("GOT message: " + message)

	def select_subprotocol(self, subprotocols):
		logger.debug("WEBSOCKET Subprotocols: " + subprotocols.__str__())
		if ( 'linuxcnc_status' in subprotocols ):
			cnc.add_status_observer(self.status_sender.send)
			self.subprotocol = "linuxcnc_status"
			return self.subprotocol
		elif ( 'linuxcnc_errors' in subprotocols ):
			cnc.add_errors_observer(self.errors_sender.send)
			self.subprotocol = "linuxcnc_errors"
			return self.subprotocol

		# Tornado 5.1 provides empty list, while 2.3 - list with empty string
		elif (subprotocols == []): # some websocket clients don't support subprotocols, so allow this if they just provide an empty string
			self.subprotocol = ""
			return self.subprotocol 
		else:
			logger.error("WEBSOCKET CLOSED: sub protocol '%s' not supported" % subprotocols.__str__())
			self.close()
			return None

	# Override to enable support for allowing alternate origins
	# By default, rejects all requests with an origin on a host other than this one
	#def check_origin(self, origin)


# Base request process
class BaseHandler(tornado.web.RequestHandler):
    # called no matter which HTTP method is used
    def prepare(self):
        pass

    # outputs HTML for use on error pages.
    # If a handler raises an exception, Tornado will call it
    def write_error(self):
        pass

    # called when the client disconnects
    def on_connecttion_close(self):
        pass

    #  may be used to set additional headers on the response
    def set_default_headers(self):
		pass

# Handler for HTML requests
class MainHandler(tornado.web.RequestHandler):
	def get(self, *args, **kwargs):

		logger.debug("HTTP GET " + args[0])
		logger.debug(self.request.headers)

		req_uri = args[0].upper()

		if (req_uri in [ '', 'INDEX.HTML', 'INDEX.HTM', 'INDEX', 'RETURN_MAINMENU']):
			if settings["autologin"] or logged_in:
				self.render( 'cnc_main.html', serv_version=APP_VERSION )
			else:
				self.render( 'cnc_login.html', serv_version=APP_VERSION )
		else:
			logger.debug("Autologin: " + str(settings["autologin"]) + ", logged_in: " + str(logged_in))

			if (req_uri.find(".HTML") == -1):
				uri = "cnc_" + args[0] + ".html"
			else:
				uri = args[0]

			if settings["autologin"] or logged_in:
				self.render(uri, serv_version=APP_VERSION)
			else:
				self.render( 'cnc_login.html', serv_version=APP_VERSION )

	def post(self, *args, **kwargs):
		logger.debug("POST ")
		logger.debug(*args)
		#data = self.get_argument('data', 'No data received')
		#logger.debug(data)
		#self.write(data)

# Handler for AJAX requests
class CommandHandler(tornado.web.RequestHandler):

	def get(self, *args, **kwargs):
		"""Handle ajax get"""
		req_uri = ''.join(*args)
		logger.debug("GET " + req_uri)
		res = cnc.handle_command(req_uri)
		self.set_header("Content-Type", "application/json")
		self.write(json.dumps(res))
		self.finish()

	@staticmethod
	def handle_login(json):
		"""Handle login request"""
		res = {"result": {'text': "user check failed", 'code': -10}}
		try:
			res = db.users.check_user(json["user_name"], json["password"])
			if (res["result"]["text"] == "OK"):
				global logged_in
				logged_in = True
				cnc.start_linuxcnc()

		except Exception as ex:
			logger.exception(ex)

		finally:
			return res

	# TODO
	@staticmethod
	def handle_logout(json):
		"""Handle logout request"""
		logged_in = False
		#cnc.stop_linuxcnc()

	def post(self, *args, **wargs):
		"""Handle ajax post"""
		req_uri = ''.join(*args)
		logger.debug("POST " + req_uri)
		req_data = tornado.escape.json_decode(self.request.body)

		# Login routine 
		if req_uri == "login":
			res = CommandHandler.handle_login(req_data)
		# CNC contol commands
		else:
			res = cnc.handle_command(req_uri, req_data)

		#logger.debug(req_data)
		#logger.debug(req_data["param"])
		
		self.set_header("Content-Type", "application/json")
		self.write(json.dumps(res))
		self.finish()

#
def make_app(app_path):
	return tornado.web.Application([
        (r"/([^\\/]*)", MainHandler, {}),
        (r"/command/(.*)", CommandHandler, {} ),
        (r"/websocket/(.*)", WebSocketHandler, {} ),
    	],
    	debug=True,
    	template_path=os.path.join(app_path, "templates"),
    	static_path=os.path.join(app_path, "static"),
    	#default_handler_class= 404 page
    )


def cnc_errors_handler(error_text_json):
	logger.error("CNC Error: %s" % error_text_json)


# auto start if executed from the command line
if __name__ == "__main__":

	try:
		"""Application config"""
		app_path = utils.get_cwd()

		read_config(os.path.join(app_path, "app.config"))

		# Create application directories
		log_path = os.path.join(app_path, "log")	# directory for log files
		try:
			os.makedirs(log_path) 
		except OSError: 
			# if not exists already - error
			if not os.path.isdir(log_path): 
				raise 
		
		"""Logger setup"""
		# Disable tornado log routine, because we will use self-made
		hn = logging.NullHandler()
		hn.setLevel(logging.DEBUG)
		#logging.getLogger("tornado.access").addHandler(hn)
		#logging.getLogger("tornado.access").propagate = False
		#logging.getLogger("tornado.general").addHandler(hn)
		#logging.getLogger("tornado.general").propagate = False
		logging.getLogger("tornado.application").addHandler(hn)
		logging.getLogger("tornado.application").propagate = False
		# Setup self-made logger
		log_file = os.path.join(log_path, "cnc_ui.log")
		logger.init(level = settings["log_level"], 
					file_path = log_file, 
					file_max_size = 4*1048576, 
					use_console= settings["log_to_console"])

		"""Database init"""
		db = app_db.Database('my.db')
		db.users.add_user("admin", "admin")

		"""Construct and serve the tornado application."""		
		app = make_app(app_path)
		http_server = HTTPServer(app)
		http_server.listen(options.port)

		"""Create periodic polling of CNC"""
		cnc = cnc_agent.LinuxCNCWorker(settings["cnc_ini_path"])
		cnc_status_scheduler = tornado.ioloop.PeriodicCallback( cnc.poll_status, 100 )
		cnc_status_scheduler.start()
		cnc_errors_scheduler = tornado.ioloop.PeriodicCallback( cnc.poll_errors, 5 )
		cnc_errors_scheduler.start()
		if settings["autologin"]:
			cnc.start_linuxcnc()
		
		logger.info('Listening on http://%s:%i' % (utils.get_current_ip(), options.port))
		# IOLoop.current().start()
		IOLoop.instance().start()

	except Exception as ex:
		logger.exception(ex)