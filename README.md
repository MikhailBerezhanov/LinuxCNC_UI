# LinuxCNC UI
### Web Interface for CNC platforms

[Learn more about LinuxCNC](http://linuxcnc.org/)

This project provides web-server for LinuxCNC-based platform that hosts User Interface to control CNC machine.  
All massive calculations for 3D visualization are replaced from CNC platfrom to browser (PC) side in that case.  
Moreover, this approach allows using machine intreface from any external system (Win, Android, Linux) that supports browsers. 

In other words, there is __no need in special screen__ for CNC-machine interface more. Ethernet LAN or Wi-Fi connection is enough.

This software was tested on LinuxCNC 2.7 systems:

* LinuxCNC Uspace 2.7.0 Debian 9 Stretch
* LinuxCNC 2.7.14 Debian 7 Wheezy (arm)

For systems above python2 upgrade needed. See `./py2.7.18_upgrade.howto` for more details.

### Main features

UI Design is primitive in current version and should be reworked later.

Nevertheless, it has usefull functional:

* Authorization
* Manual spindle control
* G-code files uploading and running
* G-code parsing for 3D visualization
* Editable tool table
* Realtime state visualization

![ui_img1](https://habrastorage.org/webt/ph/mk/dm/phmkdmmyb2jkpn8c6kk5fypml-i.jpeg)

![ui_img2](https://habrastorage.org/webt/mn/t9/gn/mnt9gnf7xnv96rcsvgyzopjm9my.jpeg)  

### Application running

Default web server's port is: __8888__. System IP will be shown in the console.  
See `./app.config` to change some settings.

```sd
# starts UI web-server
./app.py
```

Use IP:port to open UI in your browser.

### Extensions

For any addons and extensions development please refer to __official LinuxCNC documentaion__:

* [Python API](http://linuxcnc.org/docs/2.7/html/config/python-interface.html)
* [G-Code manual](http://www.linuxcnc.org/docs/html/gcode.html)


