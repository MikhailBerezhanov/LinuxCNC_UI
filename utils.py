import subprocess
import sys
import os

import pyautogui

def get_current_ip():
    cmd = "ip addr | grep eth0 | grep -w inet | cut -d' ' -f 6 | sed 's|/.*||' | tr -d '\n'"
    ret = subprocess.check_output(cmd, shell=True)
    return ret

# determine current path to executable
def get_cwd():
    return os.path.dirname(os.path.realpath(__file__))

# linuxcnc tool_change (software imitation of button-click at hal_manualtoolchange window)
def tool_change():
	height = 1920
	width = 975
	pyautogui.moveTo(height / 2, width / 2)
	pyautogui.click(button='left')
	pyautogui.keyDown('Enter')
	pyautogui.keyUp('Enter')

if __name__ == "__main__":
	tool_change()
    #print(get_current_ip())
    #print(get_cwd())