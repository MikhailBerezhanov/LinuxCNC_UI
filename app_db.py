import sqlite3
import hashlib
import time
from datetime import datetime
import os
import logger


def execute_sql(connection, cursor, sql, *args):
		try:
			rows = cursor.execute(sql, *args)
			connection.commit()
			return rows
		except sqlite3.Error as error:
			logger.error("sqlite execute error: %s" % error)
			raise


class UsersTable():
	def __init__(self, connection, cursor):
		self.name = "Users"		# Table name
		self.con = connection
		self.cur = cursor
		self.cur.execute('''CREATE TABLE IF NOT EXISTS %s (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT, 
			password_hash TEXT,
			registration_date TEXT
			);''' % self.name)
		self.con.commit()

	def add_user(self, user_name, password):
		now = datetime.now()
		reg_date = now.strftime("%Y-%m-%d %H:%M:%S")
		pass_hash = hashlib.md5(password).hexdigest()

		# check if table aready contains this user
		execute_sql(self.con, self.cur, "SELECT * FROM %s WHERE name='%s';" % (self.name, user_name))
		if(self.cur.fetchall() != []):
			logger.debug("UsersTable: user ('%s') already exists. Ignoring adding" % user_name)
			return False

		logger.debug("UsersTable: adding new user ('%s')" % user_name)

		execute_sql(self.con, self.cur, '''INSERT INTO %s (name, password_hash, registration_date) 
			VALUES (?, ?, ?);''' % self.name, (user_name, pass_hash, reg_date))

		return True

	def delete_user(self, user_name):
		logger.debug("UsersTable: deleting user ('%s')" % user_name)
		execute_sql(self.con, self.cur, "DELETE FROM %s WHERE name='%s';" % (self.name, user_name))

	def get_users(self):
		users = []
		rows = execute_sql(self.con, self.cur, "SELECT * FROM %s;" % self.name)
		for row in rows:
			users.append(row[1].encode('ascii', 'ignore'))

		users_tuple = tuple(users)
		logger.debug(users_tuple)
		return users_tuple

	def check_user(self, user_name, password):
		res = {"result": {'text': "invalid user name or password", 'code': -3}}
		pass_hash = hashlib.md5(password).hexdigest()
		rows = execute_sql(self.con, self.cur, "SELECT * FROM %s;" % self.name)
		for row in rows:
			if(user_name == row[1]):
				logger.debug("UsersTable: user ('%s') found" % user_name)
				if (pass_hash == row[2]):
					res["result"]["text"] = "OK"
					res["result"]["code"] = 0
				else:
					logger.debug("UsersTable: invalid password for user ('%s')" % user_name)
					res["result"]["text"] = "invalid password"
					res["result"]["code"] = -2
			else:
				logger.debug("UsersTable: user ('%s') not found" % user_name)
				res["result"]["text"] = "no such user"
				res["result"]["code"] = -1

		return res

class Database():
	def __init__(self, path):
		try:
			self.con = sqlite3.connect(path)
			self.cur = self.con.cursor()
			self.users = UsersTable(self.con, self.cur)
		except sqlite3.Error as error:
			logger.error("sqlite init error: %s" % error)


	def deinit(self):
		if(self.cur): 
			self.cur.close()
		if(self.con): 
			self.con.close()
			logger.debug("Database closed")
		
		

if __name__ == "__main__":
	logger.init("debug", "log/app_db.log")
	db = Database('test.db')
	db.users.add_user("admin", "admin")
	db.users.delete_user("admin2")
	db.users.get_users()
	db.users.check_user("admin", "admin")
	db.deinit()