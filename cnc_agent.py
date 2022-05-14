
import linuxcnc
import subprocess
import time
import os
from collections import OrderedDict
from datetime import datetime
import logger

import utils

# *****************************************************
# Class for work with cnc linuxcnctool table file
# *****************************************************
class ToolTableEditor():
    def __init__(self, tbl_file_path="tool.tbl"):
        self.file = tbl_file_path
        # file format demands strict order
        # 'parametr_name' <-> 'separator'
        self.parse_data = OrderedDict([
            ('T', ' '),
            ('P', ' '),
            ('X', ' '),
            ('Y', ' '),
            ('Z', ' '),
            ('A', ' '),
            ('B', ' '),
            ('C', ' '),
            ('U', ' '),
            ('V', ' '),
            ('W', ' '),
            ('D', ' '),
            ('I', ' '),
            ('J', ' '),
            ('Q', ' '),
            (';', '\n')
        ])

    def read(self):
        """Read current tool table file and return tool-data as json"""
        logger.debug("Reading tool table file (%s) content.." % self.file)

        tools = []

        try:
            with open(self.file, "r") as file:
                for line in file:
                    if line != "\n":
                        td = self.parse_tool_line(line)
                        tools.append(td)
            #logger.debug(tools)
        except Exception as ex:
            logger.exception(ex)
            return {"result": {'text': str(ex), 'code': -1}}

        return {"result": {'text': "OK", 'code': 0}, "tools": tools}

    def do_backup(method_to_decorate):
        """Decorator to backup current tool table fiele"""
        def wrapper(self, *args, **kwargs):
 
            backup_file = self.file + ".bak"
            lines = []

            try:
                with open(self.file, "r") as file:
                    for line in file:
                        lines.append(line)

                #logger.info("Backuping ")
                #logger.info(lines)

                with open(backup_file, "w") as file:
                    file.writelines(lines)

            except Exception as ex:
                logger.exception(ex)
                return {"result": {'text': str(ex), 'code': -1}}

            return method_to_decorate(self, *args, **kwargs)

        return wrapper

    @staticmethod
    def find_between(str, start, end):
        """Simple implementation of getting substr between two symbols from input str"""
        istart = str.find(start)
        if istart == -1:
            return None
        iend = str.find(end, istart)
        if iend == -1:
            return None

        if (istart+1) == iend:
            return ""

        return str[istart+1 : iend]

    def parse_tool_line(self, line):
        """Get tool-data from current file line and return it as json"""
        # Input ex: T69 P69 X1 Y2 Z3 A4 B5 C6 U7 V8 W9 D33 I0 J5 Q9 ;Added 20210621
        tool_data = {}

        # Lowercase comments to exclude it from parameters parsing
        ci = line.find(';')
        if ci != -1:
            ie = line.find('\n', ci)
            if ie != -1:
                old_comment = line[ci+1 : ie]   
                new_comment = old_comment.lower()
                line = line.replace(old_comment, new_comment)
                line = line[:ie-1] + '\n' # exclude last 'space' symb also
                #logger.debug("new line: '%s'" % line)

        def get_if_exists (data, line, s, e): 
            tmp = ToolTableEditor.find_between(line, s, e)
            if tmp and (data != None):
                data[s] = tmp 
                
        # Get tool data from formatted line 
        for key, value in self.parse_data.iteritems():
            get_if_exists( tool_data, line, key, value )

        return tool_data

    @staticmethod
    def tool_in_line(str, tool_num_arr):
        tmp = ToolTableEditor.find_between(str, 'T', ' ')
        if (tmp == None) or (str[0] != 'T'):
            logger.error("Invalid .tbl line format detected")
            return False

        for tool_num in tool_num_arr:
            if tool_num == int(tmp):
                return True

        return False

    @staticmethod
    def add_if_exists(line, idx, data, key):
            try:
                value = str(data[key])
                line[idx] += key
                line[idx] += value
                line[idx] += " "
                #logger.debug("line '%s'" % line[idx])
            except KeyError:
                pass
            except Exception as ex:
                logger.exception(ex)

    def add(self, tool_data):
        """Save new tool in tool table file"""
        # make str as list to be changable object 
        tool_line = [""]

        tool_num_arr = []

        # check if determined tool already exists in file
        try:
            tool_num_arr[0] = int(tool_data["T"])
        except KeyError:
            logger.error("No tool-number provided. Ignoring adding")
            return {"result": {'text': "No tool-number provided", 'code': -1}}
        except Exception as ex:
            logger.exception(ex)
            return {"result": {'text': str(ex), 'code': -2}}

        with open(self.file, "r") as file:
            for line in file:
                if ToolTableEditor.tool_in_line(line, tool_num_arr):
                    logger.info("Tool (%d) already exists in .tbl file. Ignoring adding" % tool_num_arr[0])
                    return {"result": {'text': "already exists in .tbl file", 'code': 1}}

        # Fill line that will be written to the file with tool data in specified format
        for key in self.parse_data:
            ToolTableEditor.add_if_exists(tool_line, 0, tool_data, key)

        logger.debug("Adding line '%s' to .tbl file" % tool_line[0])

        if tool_line[0] == "":
            logger.debug("Tool-line is empty. Ignoring adding")
            return {"result": {'text': "Invalid tool-data provided", 'code': -3}}

        tool_line[0] += "\n"

        try:
            with open(self.file, "a") as file:
                file.write(tool_line[0])

        except Exception as ex:
            logger.exception(ex)
            return {"result": {'text': str(ex), 'code': -4}}

        return {"result": {'text': "OK", 'code': 0}}

    @do_backup
    def remove(self, tool_num_arr):
        """Delete array of tools from tool table file"""
        logger.info("Removing tools: " + str(tool_num_arr))

        # Ignore Dummy deletion
        for tool_num in tool_num_arr:
            if tool_num < 0:
                return {"result": {'text': "OK", 'code': 0}}

        new_lines = []

        try:
            with open(self.file, "r") as file:
                for line in file:
                    # create new lines list (file content) without determined tool_num
                    if not ToolTableEditor.tool_in_line(line, tool_num_arr):
                        new_lines.append(line)

            with open(self.file, "w") as file:
                file.writelines(new_lines)

        except Exception as ex:
            logger.exception(ex)
            return {"result": {'text': str(ex), 'code': -1}}

        return {"result": {'text': "OK", 'code': 0}}

    @do_backup
    def update(self, tools_data_arr):
        """Make backup and rewrite current .tbl file with new tools array"""
        tools_lines = [""]
        idx = 0
        # Fill lines that will be written to the file with tool data in specified format
        for tool_data in tools_data_arr:
            for key in self.parse_data:
                ToolTableEditor.add_if_exists(tools_lines, idx, tool_data, key)
            tools_lines[idx] += "\n"
            ++idx

        try:
            with open(self.file, "w") as file:
                file.writelines(tools_lines)

        except Exception as ex:
            logger.exception(ex)
            return {"result": {'text': str(ex), 'code': -4}}

        return {"result": {'text': "OK", 'code': 0}}

# *****************************************************
# Class to poll linuxcnc for status.  Other classes can request to be notified
# when a poll happens with the add/del_observer methods
# *****************************************************
class LinuxCNCWorker(object):
    def __init__(self, ini_file_path="axis_mm.ini"):

        # open communications with linuxcnc
        self.status = linuxcnc.stat()
        self.errors = linuxcnc.error_channel()
        self.command = linuxcnc.command()

        # create dictionary with supported commands
        self.init_cmd_dict()

        try:
            self.status.poll()
            self.is_alive = True
        except linuxcnc.error, detail:
            logger.exception("linuxcnc not running (%s)" % detail)
            self.is_alive = False

        # error data
        self.last_error_text = ""
        self.last_error_id = 0
        
        # linuxcnc ini file for start
        self.ini_file = os.path.abspath(ini_file_path)
        logger.info("Using cnc ini file: " + self.ini_file)
        self.ini = linuxcnc.ini(self.ini_file)

        # register listeners
        self.status_observers = [] 
        self.errors_observers = [] 

        # tool table editor
        self.init_tool_table_editor()

    def set_ini_file(self, ini_file_path):
        logger.debug("Setting cnc ini file: " + ini_file_path)
        self.ini_file = ini_file_path
        if hasattr(self, 'ini'): del self.ini
        self.ini = linuxcnc.ini(self.ini_file)
        self.init_tool_table_editor()

    def init_tool_table_editor(self):
        if hasattr(self, 'tbl'): del self.tbl

        try:
            tbl_file = self.ini.find("EMCIO", "TOOL_TABLE") or "unknown"
            ini_dir = os.path.dirname( self.ini_file )
            tbl_path = os.path.join(ini_dir, tbl_file)
            self.tbl = ToolTableEditor(tbl_path)
        except Exception as ex:
            logger.exception(ex)
            self.tbl = None

    def add_status_observer(self, callback):
        #logger.debug("Adding status observer: %s" % str(callback))
        self.status_observers.append(callback)

    def del_status_observer(self, callback):
        self.status_observers.remove(callback)

    def add_errors_observer(self, callback):
        #logger.debug("Adding errors observer: %s" % str(callback))
        self.errors_observers.append(callback)

    def del_errors_observer(self, callback):
        #logger.debug("Removing errors observer: %s" % str(callback))
        try:
            self.errors_observers.remove(callback)
        except Exception as ex:
            logger.exception(ex)

    def clear_all(self, matching_connection):
        self.status_obervers = []
        self.errors_obervers = []

    def poll_errors(self):

        if (not self.is_alive):
            return

        try:    
            if hasattr(self, 'errors'): del self.errors
            self.errors = linuxcnc.error_channel()
            error = self.errors.poll()

            if error:
                kind, text = error
                if kind in (linuxcnc.NML_ERROR, linuxcnc.OPERATOR_ERROR):
                    typus = "error"
                else:
                    typus = "info"
                now = datetime.now() # current date and time
                self.last_error_text = {"kind": kind, 
                                        "type": typus, 
                                        "text": text, 
                                        "time": now.strftime("%Y-%m-%d %H:%M:%S"), 
                                        "id": self.last_error_id 
                }
                self.last_error_id = self.last_error_id + 1 
                # notify all obervers about error
                for observer in self.errors_observers:
                    try:
                        observer(self.last_error_text)
                    except Exception as ex:
                        self.del_errors_observer(observer)
        except:
            self.errors = None

    def poll_status(self):

        # update linuxcnc status
        try:

            # Close prevoius channels to prevent memory leaks
            if hasattr(self, 'status'): del self.status
            self.status = linuxcnc.stat()
            self.status.poll()
            if (not self.is_alive):
                logger.info("linuxcnc is available")
            self.is_alive = True
            #logger.debug("status poller: position x: %f, y: %f, z: %f" % (self.status.position[0], self.status.position[1], self.status.position[2]))
        except:
            self.status = None
            self.command = None
            if (self.is_alive):
                logger.error("linuxcnc is unavailable")
            self.is_alive = False
            #logger.info("linuxcnc poll failed")

        # notify all obervers of new status data poll
        if (self.is_alive):
            for observer in self.status_observers:
                try:
                    observer(self.status)
                except Exception as ex:
                    self.del_status_observer(observer)

    """ Commands sections """
    def start_linuxcnc(self, tries_num=3):

        logger.debug("start_linuxcnc() %s" % self.ini_file)
        p = subprocess.Popen(['pidof', '-x', 'linuxcnc'], stdout=subprocess.PIPE )
        result = p.communicate()[0]
        # Already running
        if len(result) > 0:
            logger.debug("linuxcnc already running. ignoring")
            return {"result": {'text':"already running. ignoring", 'code': -1}}

        #subprocess.Popen(['linuxcnc', self.ini_file], stderr=subprocess.STDOUT )
        for try_n in range(tries_num):
            logger.debug("Trying to start linuxcnc (%i).." % try_n)
            cmd = "linuxcnc " + self.ini_file + " 1>/dev/null 2>/dev/null &"
            if (os.system(cmd) == 0): 
                break

        if try_n == tries_num:
            return {"result": {'text':"linuxcnc start error", 'code': -2}}

        # Wait linuxcnc start
        while not self.is_alive:
            self.poll_status()
            time.sleep(0.3)

        logger.debug("linuxcnc start success")

        if hasattr(self, 'status'): del self.status
        if hasattr(self, 'errors'): del self.errors
        if hasattr(self, 'command'): del self.command

        self.status = linuxcnc.stat()
        self.errors = linuxcnc.error_channel()
        self.command = linuxcnc.command()

        # TODO: Wait axis gui to Clear opened gcode file
        #self.execute_cmd("reset_interpreter")

        return {"result": {'text':"OK", 'code': 0}}

    def stop_linuxcnc(self):
        #TODO
        pass

    # Decorator to check linuxcnc availability
    def check_linuxcnc_availability(method_to_decorate):
        def wrapper(self, *args, **kwargs):
            if (not self.is_alive):
                logger.error("linuxcnc is not running")
                return {"result": {'text': "linuxcnc is not running", 'code': -2}}
            return method_to_decorate(self, *args, **kwargs)

        return wrapper

    # cmd_tmout - timeout in sec
    @check_linuxcnc_availability
    def execute_cmd(self, cmd_name, cmd_tmout=0, *cmd_args):
        #if (not self.is_alive):
        #    return {"result": {'text': "linuxcnc is not running", 'code': -2}}

        if self.command is not None:
            # Execute given command
            self.command.__getattribute__( cmd_name )( *cmd_args )

            ret = self.command.wait_complete(cmd_tmout)

            #logger.debug("command result: " + str(ret) + '  ' + str(linuxcnc.RCS_EXEC) + '  ' + str(linuxcnc.RCS_ERROR))

            # When long command with no timeout , we dont want do wait 'command done'
            # -1  -  command starts (?) (async commands return this)
            # 1   -  command done       (sync command returns this)
            # 2   -  command is executing
            # 3   -  command error
            if cmd_tmout:
                # Fact of 'execution done' = success
                if ret == linuxcnc.RCS_DONE:
                    return {"result": {'text':"OK", 'code': 0}}
                elif ret == linuxcnc.RCS_ERROR:
                    return {"result": {'text':"command error", 'code': -2}}
                else:
                    return {"result": {'text':"command timed out", 'code': -1}}
            else:
                # Fact of 'execution' = success
                if ret == linuxcnc.RCS_ERROR:
                    return {"result": {'text':"command error", 'code': -2}}
                else:
                    return {"result": {'text':"OK", 'code': 0}}

    # Make readable dict from current cnc status
    @staticmethod
    def current_status_to_response(status):
        # Conversion to readable values
        if status.task_state == 2:
            task_state = "off"
        elif status.task_state == 4:
            task_state = "on"
        else:
            task_state = "estop" if status.estop else "estop_reset"

        estop_state = ("estop reset", "estop")
        task_modes = ("unknown", "manual", "auto", "mdi")
        interp_states = ("unknown", "idle", "reading", "paused", "waiting")

        return {"result": {'text':"OK", 'code': 0},
                "position": {'x': status.position[0], 'y': status.position[1], 'z': status.position[2]},
                "estop": estop_state[status.estop],
                "task_state": task_state,
                "task_mode": task_modes[status.task_mode],
                "homed": status.homed,
                "current_line": status.current_line,
                "motion_line": status.motion_line,
                "motion_mode": status.motion_mode,
                "motion_type": status.motion_type,
                "read_line": status.read_line,
                "interp_state": interp_states[status.interp_state],
                "file": status.file,
                "command": status.command,
                "tool_in_spindle": status.tool_in_spindle,
        } 

    # Start linuxcnc with request from UI
    def start_cnc(self, cmd_args):
        return self.start_linuxcnc()

    # Stop linuxcnc with request from UI
    def stop_cnc(self, cmd_args):
        return self.stop_linuxcnc()

    # Get current linuxcnc status
    @check_linuxcnc_availability
    def get_current_state(self, cmd_args):
        try:
            self.status.poll()
        except linuxcnc.error, detail:
            return {"result": {'text':"poll failed", 'code': detail}}

        return LinuxCNCWorker.current_status_to_response(self.status)

    def set_state(self, cmd_args):
        """Set new cnc machine state ['on', 'off', 'estop', 'estop_reset']"""
        states = {
            "on": linuxcnc.STATE_ON,
            "off": linuxcnc.STATE_OFF,
            "estop": linuxcnc.STATE_ESTOP,
            "estop_reset": linuxcnc.STATE_ESTOP_RESET
        }

        try:
            state_name = cmd_args["state"]
            new_state = states[state_name]
        except Exception as ex:
            logger.exception(ex)
            return {"result": {"text": str(ex), "code": -1}}

        return self.execute_cmd("state", 3, new_state)

    def set_task_mode(self, cmd_args):
        """Set new task mode ['manual', 'mdi', 'auto']"""
        modes = { 
            "manual": linuxcnc.MODE_MANUAL,
            "mdi": linuxcnc.MODE_MDI,
            "auto": linuxcnc.MODE_AUTO,
        }
        try:
            mode_name = cmd_args["mode"]
            new_mode = modes[mode_name]
        except Exception as ex:
            logger.exception(ex)
            return {"result": {"text": str(ex), "code": -1}}


        def ok_for_mode(s, mode, homed_check):
            s.poll()
            if homed_check and not (s.homed.count(1) == s.axes):
                return "Cannot enter " + mode + " mode: Axes not homed"
            if not (s.interp_state == linuxcnc.INTERP_IDLE):
                return "Cannot enter " + mode + " mode: Interpreter is running"
            if s.estop:
                return "Cannot enter " + mode + " mode: CNC in Estop state"
            if not s.enabled:
                return "Cannot enter " + mode + " mode: CNC is disabled"

            return ""

        # prepare for new mode
        if new_mode == linuxcnc.MODE_MDI:
            res_text = ok_for_mode(self.status, "MDI", True)
            if res_text != "":
                return {"result": {"text": res_text, "code": -2}}

        if new_mode == linuxcnc.MODE_MANUAL:
            res_text = ok_for_mode(self.status, "Manual", False)
            if res_text != "":
                return {"result": {"text": res_text, "code": -2}}
 

        return self.execute_cmd("mode", 5, new_mode)

    # cmd_args - number of axis
    def home_axis(self, cmd_args):
        try:
            axis_num = cmd_args["axis_number"]
        except Exception as ex:
            logger.exception(ex)
            return {"result": {"text": str(ex), "code": -1}}

        return self.execute_cmd("home", 3, axis_num)

    #
    def home_all(self, cmd_args):
        self.execute_cmd("mode", 0, linuxcnc.MODE_MANUAL)
        
        for i in range(3):
            ret = self.execute_cmd("home", 3, i)
            if ret["result"]["text"] != "OK": 
                return ret

        return ret 

    # cmd_args - dictionary: axis_number (int)
    def move_axis_stop(self, cmd_args):
        try:
            axis_num = cmd_args["axis_number"]
        except Exception as ex:
            logger.exception(ex)
            return {"result": {"text": str(ex), "code": -1}}

        return self.execute_cmd("jog", 0, linuxcnc.JOG_STOP, axis_num)

    # cmd_args - dictionary: axis_number, velocity (int, int)
    def move_axis_continuous(self, cmd_args):
        try:
            axis_num = cmd_args["axis_number"]
            vel = cmd_args["velocity"]
        except Exception as ex:
            logger.exception(ex)
            return {"result": {"text": str(ex), "code": -1}}

        self.execute_cmd("mode", 0, linuxcnc.MODE_MANUAL)
        return self.execute_cmd("jog", 0, linuxcnc.JOG_CONTINUOUS, axis_num, vel)

    # cmd_args - dictionary: axis_number, velocity, distance (int, int, int)
    def move_axis_increment(self, cmd_args):
        try:
            axis_num = cmd_args["axis_number"]
            vel = cmd_args["velocity"]
            dist = cmd_args["distance"]
        except Exception as ex:
            logger.exception(ex)
            return {"result": {"text": str(ex), "code": -1}}

        self.execute_cmd("mode", 0, linuxcnc.MODE_MANUAL)
        return self.execute_cmd("jog", 0, linuxcnc.JOG_INCREMENT, axis_num, vel, dist)

    #
    @check_linuxcnc_availability
    def get_ini_params(self, cmd_args=None):

        ini_info = { "result": {'text':"no axis info found", 'code': -1}, "axis_info": [] }
        ini_info["machine_name"] = self.ini.find("EMC", "MACHINE") or "unknown"
        
        ini_info["default_velocity"] = self.ini.find("TRAJ", "DEFAULT_VELOCITY")
        ini_info["max_linear_velocity"] = self.ini.find("TRAJ", "MAX_LINEAR_VELOCITY")

        axis_num = self.ini.find("TRAJ", "AXES") or 0
        if axis_num:
            ini_info["result"]["text"] = "OK"
            ini_info["result"]["code"] = 0

        ini_info["axis_num"] = int(axis_num)

        # read params of available axis
        for axis in range(int(axis_num)):
            section = "AXIS_" + str(axis)
            axis_data = { "number": axis }
            param_tuple = ("MAX_LIMIT", "MIN_LIMIT", "HOME_OFFSET")
            for param in param_tuple:
                tmp = self.ini.find(section, param)
                if tmp:
                    axis_data[param.lower()] = tmp
            ini_info["axis_info"].append(axis_data)

        #logger.debug(ini_info)
        return ini_info 

    # Save new gcode file from client and push it to linuxcnc
    @check_linuxcnc_availability
    def load_gcode_file(self, cmd_args=None):
        res = { "result": {'text':"OK", 'code': 0} }

        path = os.path.join( "/tmp", cmd_args["name"] )
        logger.debug("saving gcode file: " + path)
            
        try:
            fo = open( path, 'w' )
            content = cmd_args["content"]
            # write data into file
            fo.write(content)
        except Exception as ex:
            logger.exception(ex)
            res['result']['text'] = str(ex)
            res['result']['code'] = -1
        finally:
            try:
                fo.close()
            except Exception as ex:
                logger.exception(ex)
                res['result']['text'] = "file closing failed"
                res['result']['code'] = -2

        if (res['result']['code'] == 0):
            self.reset_interpreter()
            self.execute_cmd("mode", 3, linuxcnc.MODE_AUTO)
            res = self.execute_cmd("program_open", 5, path)
            self.execute_cmd("mode", 3, linuxcnc.MODE_MANUAL)

        return res

    def run_gcode(self, cmd_args=None):
        self.execute_cmd("mode", 3, linuxcnc.MODE_AUTO)

        try:
            line_no = cmd_args["line_number"]
        except:
            line_no = 0

        logger.debug("Starting g-code from line: " + str(line_no));

        return self.execute_cmd("auto", 0, linuxcnc.AUTO_RUN, line_no)

    @check_linuxcnc_availability
    def step_gcode(self, cmd_args=None):
        try:
            self.status.poll()
        except linuxcnc.error, detail:
            return {"result": {'text':"poll failed", 'code': detail}}

        if(self.status.task_mode != 2):
            logger.debug("setting auto mode")
            self.execute_cmd("mode", 3, linuxcnc.MODE_AUTO)
            # To start step execution we need 2 more commands 
            self.execute_cmd("auto", 0, linuxcnc.AUTO_STEP)
            self.execute_cmd("auto", 0, linuxcnc.AUTO_STEP)

        return self.execute_cmd("auto", 0, linuxcnc.AUTO_STEP)

    def pause_gcode(self, cmd_args=None):
        return self.execute_cmd("auto", 0, linuxcnc.AUTO_PAUSE)

    def resume_gcode(self, cmd_args=None):
        return self.execute_cmd("auto", 0, linuxcnc.AUTO_RESUME)

    def stop_gcode(self, cmd_args=None):
        return self.execute_cmd("abort")

    def reset_interpreter(self, cmd_args=None):
        return self.execute_cmd("reset_interpreter")

    @check_linuxcnc_availability
    def get_gcode_content(self, cmd_args=None):
        try:
            self.status.poll()
        except linuxcnc.error, detail:
            return {"result": {'text':"poll failed", 'code': detail}}

        if(self.status.file == ""):
            logger.debug("No gcode file opened")
            return {"result": {'text':"OK", 'code': 0}, "content": ""}

        logger.debug("Getting gcode file (%s) content.." % self.status.file)

        content = ""

        with open(self.status.file, "r") as file:
            for line in file:
                content += line

        return {"result": {'text':"OK", 'code': 0}, "content": content}

    def tool_change(self, cmd_args=None):
        """TODO: signal hal_manualtoolchange component"""
        utils.tool_change()
        return {"result": {'text':"OK", 'code': 0}}


    def get_tools_data(self, cmd_args=None):
        """Get current tool table file content as formatted json"""
        return self.tbl.read()

    def reload_tools(self, cmd_args=None):
        """Reload tool table in linuxcnc"""
        return self.execute_cmd("load_tool_table")

    def delete_tools(self, cmd_args=None):
        """Delete selected tool from tool table file"""
        try:
            tools_arr = cmd_args["tools"]
        except Exception as ex:
            logger.exception(ex)
            return {"result": {"text": str(ex), "code": -1}}

        return self.tbl.remove(tools_arr)

    def update_tools(self, cmd_args):
        """Rewrite tool table file with new tools data array"""
        try:
            tools_arr = cmd_args["tools_data"]
        except Exception as ex:
            logger.exception(ex)
            return {"result": {"text": str(ex), "code": -1}}

        return self.tbl.update(tools_arr)

    def run_mdi(self, cmd_args):
        """"""
        try: 
            mdi_cmd = cmd_args["command"]
        except Exception as ex:
            logger.exception(ex)
            return {"result": {"text": str(ex), "code": -1}}
            
        logger.debug("Running MDI command: %s" % mdi_cmd)

        return self.execute_cmd("mdi", 0, mdi_cmd)

    # Supported Commands table
    def init_cmd_dict(self):
        self.cmd_dict = {
            "start_cnc": self.start_cnc,
            "stop_cnc": self.stop_cnc,
            "current_state": self.get_current_state,
            "set_state": self.set_state,
            "set_task_mode": self.set_task_mode,
            "home_axis": self.home_axis,
            "home_all": self.home_all,
            "move_axis_stop": self.move_axis_stop,
            "move_axis_continuous": self.move_axis_continuous,
            "move_axis_increment": self.move_axis_increment,
            "ini_params": self.get_ini_params,
            "load_gcode": self.load_gcode_file,
            "run_gcode": self.run_gcode,
            "step_gcode": self.step_gcode,
            "pause_gcode": self.pause_gcode,
            "resume_gcode": self.resume_gcode,
            "stop_gcode": self.stop_gcode,
            "reset_interpreter": self.reset_interpreter,
            "gcode_content": self.get_gcode_content,
            "tool_change": self.tool_change,
            "tools_data": self.get_tools_data,
            "delete_tools": self.delete_tools,
            "reload_tool_table": self.reload_tools,
            "update_tools": self.update_tools,
            "run_mdi": self.run_mdi,
        }

    # cmd_name - string-key name of API command for linuxcnc
    # cmd_dic - dictionary with command arguments
    def handle_command(self, cmd_name, cmd_dic=None):
        if cmd_name not in self.cmd_dict:
            logger.debug("Unsupported command (%s)" % cmd_name);
            return {"result": {'text':"unsupported command", 'code': -3}}
        #logger.debug(cmd_dic)
        return self.cmd_dict[cmd_name](cmd_dic)








if __name__ == "__main__":
    logger.init("debug", "log/cnc_agent.log")
    #poller = LinuxCNCWorker()
    
    #poller.start_linuxcnc()

    #poller.execute_cmd("abort")
    #poller.execute_cmd("state", 3, linuxcnc.STATE_ESTOP_RESET)
    #poller.execute_cmd("state", 3, linuxcnc.STATE_ON)

    #poller.execute_cmd("jog", 0, linuxcnc.JOG_INCREMENT, 1, 1, 20)

    #poller.get_ini_params()

    tbl = ToolTableEditor("/home/mik/linuxcnc/configs/gui6/tool.tbl.bak")
    #tbl.add({"T": 43, ";": "test"})
    logger.debug("After adding:")
    res = tbl.read()
    #logger.debug(res)
    tbl.remove([3, 4, 8])
    #logger.debug("After removing:")
    #tbl.read()
    '''tbl.update([
        {"T": "1", "P": "43", ";": "testing"},
        {"T": "3", "P": "42", ";": "update"},
        {"T": "4", "X": "41", ";": "testing qwetwet"},
        {"T": "8", "V": "40", ";": "update qwewqr"},
    ])'''
