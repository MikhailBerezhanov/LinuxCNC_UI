

/*
* Sends AJAX request to CNC server
*   @param  
*/
function ajax_transcieve(method, uri, data=null, ok_cb=null, fail_cb=null, upload_progress_cb=null)
{
    let xhr = new XMLHttpRequest();
    xhr.open(method, uri, true);
    xhr.setRequestHeader("Content-Type", "application/json");

    let tx_json = null;
    if(data){
        tx_json = JSON.stringify(data);
    } 
  
    xhr.onload = function() {
        //console.log("[cnc_api] Response:\n" + xhr.responseText);
        let rx_json = null;
        try{
            if(xhr.status != 200){
                console.warn("Server response with not OK status (" + xhr.status + "): " + xhr.statusText);
                if(fail_cb) fail_cb({result: {text: xhr.statusText, code: xhr.status}});
                return;
            }

            rx_json = JSON.parse(xhr.responseText);
        }
        catch(err){
            console.log(err);
            if(fail_cb) fail_cb({result: {text: "json parse failed", code: -99}});
            return;
        }
         
        if(rx_json.result.text === "OK"){
            if(ok_cb) ok_cb(rx_json);
        } 
        else{
            if(fail_cb) fail_cb(rx_json);
        } 
    }

    xhr.onerror = function() {
        console.warn(`AJAX Connection problem occured`);
        if(fail_cb) fail_cb({result: {text: "ajax request failed", code: -63}});
    }

    xhr.upload.onprogress = function(event) {
      //console.log(`Отправлено ${event.loaded} из ${event.total} байт`);
      if(upload_progress_cb) upload_progress_cb(event)
    };
 
    //console.log("Sending request: \n" + tx_json);
    xhr.send(tx_json); 
}


/*
* Login request
*   @param  "start_cnc" or "stop_cnc"
*/
export function cnc_start_stop(param, ok_callback, fail_callback)
{
    ajax_transcieve("GET", "command/" + param, null, ok_callback, fail_callback);
}


/*
* Login request
*   @param  
*/
export function cnc_login(param, ok_callback, fail_callback)
{
    ajax_transcieve("POST", "command/login", {"user_name": param.user_name, "password": param.password}, ok_callback, fail_callback);
}

/*
* Set state of cnc machine
*   @param  cnc state to set: estop, estop_reset, on, off
*/
export function get_current_state(ok_callback, fail_callback)
{
    let promise = new Promise((resolve, reject) =>{
        ajax_transcieve("GET", "command/current_state" , null, 
            (json) => { resolve(json); }, (json) => { reject(new Error(json.result.text)) } ); 
    });

    return promise;
}

/*
* Home demanded axis
*   @param  number of axis (0 - X, 1 - Y, 2 - Z)
*/
export function home_axis(param, ok_callback, fail_callback)
{
    ajax_transcieve("POST", "command/home_axis", {"axis_number": param}, ok_callback, fail_callback);        
}

/*
* Home X,Y,Z axis
*   @param  not used
*/
export function home_all(ok_callback, fail_callback)
{
    ajax_transcieve("GET", "command/home_all", null, ok_callback, fail_callback);          
}

/*
* Set state of cnc machine
*   @param  cnc state to set: ['estop', 'estop_reset', 'on', 'off']
*/
export function set_state(param, ok_callback, fail_callback)
{
    ajax_transcieve("POST", "command/set_state", { "state": String(param) }, ok_callback, fail_callback);        
}

/*
* Set task mode of cnc machine 
*   @param  task mode to set: ['manual', 'mdi', 'auto']
*/
export function set_task_mode(param, ok_callback, fail_callback)
{
    ajax_transcieve("POST", "command/set_task_mode", { "mode": String(param) }, ok_callback, fail_callback);        
}

/*
* Move axis
*   @type   ["stop", "continuous", "increment"]
*   @param  axis_number [, velocity [, distance]]
*/
export function move_axis(type, param, ok_callback, fail_callback)
{
    ajax_transcieve("POST", "command/move_axis_" + type, param, ok_callback, fail_callback);          
}


/*
* Get CNC ini params (async)
*   @returns    promise with ini json or error
*/
export function get_ini_params()
{
    let promise = new Promise((resolve, reject) =>{
        ajax_transcieve("GET", "command/ini_params" , null, 
            (json) => { resolve(json); }, (json) => { reject(new Error(json.result.text)) } ); 
    });

    return promise;         
}



/*
* Send g-code file to cnc machine   
*/
export function send_gcode_file(file_name, file_content, ok_callback, fail_callback)
{
    ajax_transcieve("POST", "command/load_gcode", { "name": file_name, "content": file_content }, ok_callback, fail_callback); 
}

/*
* Run loaded g-code    
*/
export function start_gcode(line_num, ok_callback, fail_callback)
{
    ajax_transcieve("POST", "command/run_gcode", {"line_number": line_num}, ok_callback, fail_callback); 
}

/*
* Step loaded g-code   
*/
export function step_gcode(ok_callback, fail_callback)
{
    ajax_transcieve("GET", "command/step_gcode", null, ok_callback, fail_callback); 
}

/*
* Pause loaded g-code    
*/
export function pause_gcode(ok_callback, fail_callback)
{
    ajax_transcieve("GET", "command/pause_gcode", null, ok_callback, fail_callback); 
}

/*
* Resume loaded g-code    
*/
export function resume_gcode(ok_callback, fail_callback)
{
    ajax_transcieve("GET", "command/resume_gcode", null, ok_callback, fail_callback); 
}

/*
* Stop loaded g-code    
*/
export function stop_gcode(ok_callback, fail_callback)
{
    ajax_transcieve("GET", "command/stop_gcode", null, ok_callback, fail_callback); 
}

/*
* Reset g-code interpreter 
*/
export function reset_gcode_interpreter(ok_callback, fail_callback)
{
    ajax_transcieve("GET", "command/reset_interpreter", null, ok_callback, fail_callback); 
}

/*
* Get current g-code file content
*/
export function get_gcode_content()
{
    let promise = new Promise((resolve, reject) => {
        ajax_transcieve("GET", "command/gcode_content" , null, 
            (json) => { resolve(json); }, 
            (json) => { reject(new Error(json.result.text)) } ); 
    });

    return promise;
}

/*
* Tool change finished    
*/
export function change_tool(ok_callback, fail_callback)
{
    ajax_transcieve("GET", "command/tool_change", null, ok_callback, fail_callback); 
}

/*
* Get Tool table data   
*/
export function get_tools_data(ok_callback, fail_callback)
{
    ajax_transcieve("GET", "command/tools_data", null, ok_callback, fail_callback); 
}

/*
* Reload tool table in linuxcnc  
*/
export function reload_tool_table(ok_callback, fail_callback)
{
    ajax_transcieve("GET", "command/reload_tool_table", null, ok_callback, fail_callback); 
}

/*
* Remove selected tool from tool table file
*/
export function delete_tools(tool_num_arr, ok_callback, fail_callback)
{
    ajax_transcieve("POST", "command/delete_tools", {tools: tool_num_arr}, ok_callback, fail_callback); 
}

/*
* Update tool table file with new tools
*/
export function update_tools(tools_data_arr, ok_callback, fail_callback)
{
    ajax_transcieve("POST", "command/update_tools", {tools_data: tools_data_arr}, ok_callback, fail_callback); 
}

/*
* Execute MDI command
*/
export function run_mdi(cmd, ok_callback=null, fail_callback=null)
{
    ajax_transcieve("POST", "command/run_mdi", {command: cmd}, ok_callback, fail_callback); 
}