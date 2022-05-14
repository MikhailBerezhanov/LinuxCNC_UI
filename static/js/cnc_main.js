
import * as THREE from './threejs/build/three.module.js';
import * as CNC from './cnc_api.module.js';
import * as COMMON from './common.module.js';
import { OrbitControls } from './threejs/jsm/controls/OrbitControls.js';
import { NGCodeLoader } from './cnc_gcode_loader.js';
import { BufferGeometryUtils } from './threejs/jsm/utils/BufferGeometryUtils.js';

// Three-js objects
let camera, scene, renderer, controls;
let cube, cone;

// Marker sizes
const cone_radius = 2;
const cone_height = 5;
const z_offset = cone_height/2;  // offset to compensate cone marker height at Z axis


// Status listener web socket 
let ws_status_timer = null;
let status_listeners = [];

// Errors listener web socket
let ws_errors_timer = null;
let errors_listeners = [];

// Saved previous marker position
let prev_x_pos = +0.0.toFixed(3);
let prev_y_pos = +0.0.toFixed(3);
let prev_z_pos = +0.0.toFixed(3);
let x_homed = 0;
let y_homed = 0;
let z_homed = 0;

// ----------------------------------------------- 3D animation -----------------------------------------------

let trajectory_lines = [];    // Array of lines geometries
let lines_cnt = 0;            // Current number of trajectory lines
let lines_num_to_merge = 100; // Axeed this number to merge each line to unite geometry

function merge_trajectory()
{

  console.log('Merging current trajectory to unite Geometry');

  // remove current independent lines
  clear_current_trajectory();

  //console.log(`Adding lines array: ${trajectory_lines.length}` + trajectory_lines);

  // create new unite geometry
  const trajectory_geom = BufferGeometryUtils.mergeBufferGeometries(trajectory_lines);

  if (trajectory_geom === null){
    console.warn('mergeBufferGeometries failed');
    return;
  }

  const trajectory_union = new THREE.Line(trajectory_geom, new THREE.LineBasicMaterial({color: "green"}) );
  trajectory_union.name = "trajectory_mesh";
  scene.add( trajectory_union );

  render();
}



// pos_start, pos_end - THREE.Vector3
function add_trajectory_line(pos_start, pos_end)
{
  const points = [];
  points.push(pos_start);
  points.push(pos_end);

  //console.log("trajectory: start: (" + pos_start + "), end: (" + pos_end + ")");

  const geometry = new THREE.BufferGeometry().setFromPoints( points );
  const material = new THREE.LineBasicMaterial( { 
    color: "green",
    //linewidth: 5, // in pixel
  });

  // Save current line in trajecory geometry array
  trajectory_lines.push(geometry);
  lines_cnt++;
  if(lines_cnt >= lines_num_to_merge){
    merge_trajectory();
    lines_cnt = 0; // reset lines counter
  }

  const line = new THREE.Line( geometry, material );
  line.matrixAutoUpdate = false; // make static
  line.name = "trajectory_line";
  scene.add( line );

  render();
}

// NOTE: Render should be called after clearing
function clear_current_trajectory()
{
  for (let i = scene.children.length - 1; i >= 0; i--) {
    //console.log(scene.children[i].name);
    if(scene.children[i].name === "trajectory_line" || scene.children[i].name === "trajectory_mesh"){

        //console.log(`geom: ${scene.children[i].geometry}, material: ${scene.children[i].material}`);

        // Free memory
        if(scene.children[i].geometry !== undefined){
          scene.children[i].geometry.dispose();
          scene.children[i].material.dispose();
          //scene.children[i].Texture.dispose();
        }
        
        scene.remove(scene.children[i]);
    }
  }

  renderer.renderLists.dispose();
}

// Setup scene, camera, renderer, controls, 3d-objects 
// work_field_height  - X axis limit
// work_field_height  - Y axis limit
function plot_init(canvas_id, area_min_limits = {x:-200, y:-200, z:-20}, area_max_limits = {x:200, y:200, z:100}, marker_pos = {x: 0, y: 0, z: 0})
{
  scene = new THREE.Scene();

  // Adjust canvas sizes
  let elem_id = document.getElementById(canvas_id);
  let zone_width = elem_id.clientWidth;
  let zone_height = elem_id.clientHeight;
  //console.log("zone_height: " + zone_height);
  //console.log("zone_width: " + zone_width);

  camera = new THREE.PerspectiveCamera( 90, zone_width / zone_height, 0.1, 100000 );

  // Reverse Y and Z axis coordinate system
  camera.up.set(0, 0, 1);
  camera.position.set(10, -5, 60);
  // By default, when we call scene.add(), the thing we add will be added to the coordinates (0,0,0). This would cause both the camera and the cube to be inside each other. To avoid this, we simply move the camera out a bit.
  //camera.lookAt(scene.position);


  renderer = new THREE.WebGLRenderer();
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( zone_width, zone_height );
  //renderer.setClearColor(0xcccccc);
  elem_id.appendChild( renderer.domElement )

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  //controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
  //controls.dampingFactor = 0.05;

  controls.screenSpacePanning = false;
  controls.rotateSpeed = 1;
  controls.zoomSpeed = 3;

  controls.minDistance = 5;
  controls.maxDistance = 500;

  controls.maxPolarAngle = Math.PI / 2;

  controls.addEventListener( 'change', render );

  controls.update();


  // Working area
  const min = area_min_limits;
  const max = area_max_limits;
  //console.log(min);
  //console.log(max);
  const work_area_width = max.x - min.x;
  const work_area_length = 0;
  const work_area_height = 0;

  const work_area_vertices = [];
  
  work_area_vertices.push(new THREE.Vector3(min.x, min.y, min.z));
  work_area_vertices.push(new THREE.Vector3(max.x, min.y, min.z));
  work_area_vertices.push(new THREE.Vector3(max.x, max.y, min.z));
  work_area_vertices.push(new THREE.Vector3(min.x, max.y, min.z));
  work_area_vertices.push(new THREE.Vector3(min.x, min.y, min.z));
  work_area_vertices.push(new THREE.Vector3(min.x, min.y, max.z));
  work_area_vertices.push(new THREE.Vector3(max.x, min.y, max.z));
  work_area_vertices.push(new THREE.Vector3(max.x, max.y, max.z));
  work_area_vertices.push(new THREE.Vector3(min.x, max.y, max.z));
  work_area_vertices.push(new THREE.Vector3(min.x, min.y, max.z));


  const work_area_geom = new THREE.BufferGeometry().setFromPoints( work_area_vertices );
  const work_area_mat = new THREE.LineDashedMaterial({color: "pink", 
                                                linewidth: 1,
                                                scale: 1,
                                                dashSize: 5,
                                                gapSize: 5, 
                                              });
  const work_area_mesh = new THREE.Line(work_area_geom, work_area_mat);
  work_area_mesh.matrixAutoUpdate = false;  // make static
  work_area_mesh.computeLineDistances();
  scene.add(work_area_mesh);

/*
  const plane_geom = new THREE.BoxGeometry( work_field_width, work_field_height, 40 );//
  const plane_mat = new THREE.LineDashedMaterial({color: "gray", 
                                                linewidth: 1,
                                                scale: 1,
                                                dashSize: 3,
                                                gapSize: 1, 
                                              });
  //const plane = new THREE.GridHelper(500, 20);
  const plane = new THREE.Mesh(plane_geom, plane_mat);
  
  //worldAxis.rotateY(90 * Math.PI/180);
  //plane.add(worldAxis);
  plane.position.x = work_field_width/2;
  plane.position.z = -work_field_height/2;
  plane.position.y = z_offset;  

  plane.rotateX(90 * Math.PI/180);
  //scene.add(plane);
*/

  // Cube (WorldAxis start point)
  const world_axis_size = work_area_width/3;
  const world_axis = new THREE.AxesHelper(world_axis_size);
  world_axis.matrixAutoUpdate = false; // static
  const cube_geom = new THREE.BoxGeometry(1, 1, 1);
  const cube_mat = new THREE.MeshBasicMaterial({color: "gray", wireframe: true});
  cube = new THREE.Mesh(cube_geom, cube_mat);
  cube.position.x = 0;
  cube.position.z = 0;
  cube.position.y = 0;//z_offset;
  //world_axis.rotateX(Math.PI * 1.5);
  //world_axis.rotateY(Math.PI * 0.5);
  cube.add(world_axis);
  cube.matrixAutoUpdate = false;
  scene.add(cube);
  //var cubeAxis = new THREE.AxesHelper(20);
  //cube.add(cubeAxis);

  // Marker - Cone
  const cone_geometry = new THREE.ConeGeometry( cone_radius, cone_height, 32, true );
  const cone_material = new THREE.MeshBasicMaterial( {color: "red", wireframe: true} );
  cone = new THREE.Mesh( cone_geometry, cone_material );
  // the angle to rotate in radians
  cone.position.set(marker_pos.x, marker_pos.y, marker_pos.z + z_offset);
  cone.rotateX( Math.PI * 1.5 );
  scene.add(cone);

  // Axis names text
  const loader = new THREE.FontLoader();
  loader.load( 'static/helvetiker_regular.typeface.json', function ( font ) {

    const x_text_geo = new THREE.TextGeometry( 'X', {
      font: font,
      size: 10,
      height: 0,
      curveSegments: 12,
    } );
    const x_text_mat = new THREE.MeshBasicMaterial( { color: "red" } );
    const x_text_mesh = new THREE.Mesh(x_text_geo, x_text_mat);
    x_text_mesh.position.set(world_axis_size + 2, -5, 0);

    const y_text_geo = new THREE.TextGeometry( 'Y', {
      font: font,
      size: 10,
      height: 0,
      curveSegments: 12,
    } );
    const y_text_mat = new THREE.MeshBasicMaterial( { color: "green" } );
    const y_text_mesh = new THREE.Mesh(y_text_geo, y_text_mat);
    y_text_mesh.position.set(-4, world_axis_size + 2, 0);

    const z_text_geo = new THREE.TextGeometry( 'Z', {
      font: font,
      size: 10,
      height: 0,
      curveSegments: 12,
    } );
    const z_text_mat = new THREE.MeshBasicMaterial( { color: "blue" } );
    const z_text_mesh = new THREE.Mesh( z_text_geo, z_text_mat );
    z_text_mesh.rotateX(Math.PI * 0.5);
    z_text_mesh.position.set(-4, 0, world_axis_size + 2);

    scene.add(x_text_mesh);
    scene.add(y_text_mesh);
    scene.add(z_text_mesh);
  } );


  // Add trajectory updating function to status data processing
  //add_status_listener(update_trajectory)

  status_listener.add_listener(update_trajectory);

  /* TESTING NGCODE LOADER
  const gloader = new NGCodeLoader();
  gloader.load( 'static/gcodes/ramka.ngc', function ( object ) {

    //object.position.set( - 100, - 20, 100 );
    scene.add( object );

    render();

  } );*/
} 

// Enable online rendering 
function animate() {
  //requestAnimationFrame(animate);
  // Set 30 FPS
  setTimeout( function() {
    requestAnimationFrame( animate );
  }, 1000 / 30 );

  //controls.update(); // only required if controls.enableDamping = true, or if controls.autoRotate = true

  render();
}

// Render the scene
function render() {
  renderer.render(scene, camera);
}

// Resize canvas when window sizes change
function resize(canvas_id) {
  let elem_id = document.getElementById(canvas_id);
  let zone_width = elem_id.clientWidth;
  let zone_height = elem_id.clientHeight;

  camera.aspect = zone_width / zone_height;
  camera.updateProjectionMatrix();

  renderer.setSize( zone_width, zone_height );

  render();
}


export function init_plot()
{
  // Get working area sizes
  let min_limits = {x: 0, y: 0, z: 0};
  let max_limits = {x: 100, y: 100, z: 100};
  let area_limits = {min: min_limits, max: max_limits, set: false};

  let marker_pos = {x: 0, y: 0, z: 0};

  function update_plot_content()
  {
    gc.update_content();
  }

  // Create working area after receiving ini params
  function create_plot(){
    let ini_promise = CNC.get_ini_params();
    ini_promise.then(
      (json) => {
        //console.log("ini load success!");
        
        area_limits.min.x = Number(json.axis_info[0].min_limit);
        area_limits.min.y = Number(json.axis_info[1].min_limit);
        area_limits.min.z = Number(json.axis_info[2].min_limit);
        
        area_limits.max.x = Number(json.axis_info[0].max_limit);
        area_limits.max.y = Number(json.axis_info[1].max_limit);
        area_limits.max.z = Number(json.axis_info[2].max_limit);
        area_limits.set = true;

        // Update move speed slider range
        let speed_range = document.getElementById("axis_move_speed");
        speed_range.value = json.default_velocity * 60; // conversion from cnc velocity to speed [mm\min] 
        document.getElementById("axis_move_speed_value").innerHTML = speed_range.value;
        speed_range.max = json.max_linear_velocity * 60;

        // Create 3d visualization
        //console.log(area_limits);
        console.log("init load success. plot init");
        plot_init("canvas-3d", area_limits.min, area_limits.max, marker_pos);
        render();
      },
      (error) => {
        console.warn(`ini load error: ${error.message}. Using default values:`);
        console.log(area_limits);
        console.log(marker_pos);
        plot_init("canvas-3d", area_limits.min, area_limits.max, marker_pos);
        render();
      }
    ).then(update_plot_content);  // Update page when plot is ready
  }

  // Get current position of marker before rendering the plot
  let current_state_promise = CNC.get_current_state();
  current_state_promise
  .then(
      (state) => { 
        //console.log(`Current pos: (${state.position.x}, ${state.position.y}, ${state.position.z})`);
        marker_pos.x = state.position.x;
        marker_pos.y = state.position.y;
        marker_pos.z = state.position.z;
      },
      (error) => {
        console.warn(`current state load error: ${error.message}. Using default values`);
      }
  )
  .then(create_plot);

  //console.log(`Set marker pos: (${marker_pos.x}, ${marker_pos.y}, ${marker_pos.z})`);

  window.addEventListener( 'resize', () => { resize("canvas-3d") } );

  let clear_button = document.getElementById("clear_traj_but");
  clear_button.addEventListener("click", () => { 
                                  clear_current_trajectory();
                                  trajectory_lines.length = 0;  // Clear Array of current lines 
                                  lines_cnt = 0;                // Reset trajectory linse counter
                                  render();
                                });
}


// Update X, Y, Z values and marker's position
function update_trajectory(json)
{
  let x_value_str = json.position.x.toFixed(3); // Strings
  let y_value_str = json.position.y.toFixed(3);
  let z_value_str = json.position.z.toFixed(3);

  let x_homed_state = json.homed[0];
  let y_homed_state = json.homed[1];
  let z_homed_state = json.homed[2];

  let x_value_num = +x_value_str;
  let y_value_num = +y_value_str;
  let z_value_num = +z_value_str;

  //console.log("X: " + x_value_num);

  let x = document.getElementById("X_axis_value");
  let y = document.getElementById("Y_axis_value");
  let z = document.getElementById("Z_axis_value");
  x.innerHTML = x_value_str;
  y.innerHTML = y_value_str;
  z.innerHTML = z_value_str;

  if((prev_x_pos != x_value_num) || (prev_y_pos != y_value_num) || (prev_z_pos != z_value_num)){
    //console.log("updating position..");

    const prev_pos = new THREE.Vector3(cone.position.x, cone.position.y, cone.position.z - z_offset);
    cone.position.set(x_value_num, y_value_num, z_value_num + z_offset);
    const curr_pos = new THREE.Vector3(cone.position.x, cone.position.y, cone.position.z - z_offset);
    add_trajectory_line(prev_pos, curr_pos);
  }

  if((x_homed != x_homed_state)){
    document.getElementById("X_homed").style.opacity = x_homed_state;
  }

  if((y_homed != y_homed_state)){
    document.getElementById("Y_homed").style.opacity = y_homed_state;
  }

  if((z_homed != z_homed_state)){
    document.getElementById("Z_homed").style.opacity = z_homed_state;
  }

  prev_x_pos = x_value_num;
  prev_y_pos = y_value_num;
  prev_z_pos = z_value_num;

  x_homed = x_homed_state;
  y_homed = y_homed_state;
  z_homed = z_homed_state;
}

// --------------------------------------- Page Controls and Visualizations ----------------------------


// --------------------------- CNC status channel -------------------------
class SocketListener
{
  constructor(port, uri, protocol){
    this.listeners = [];
    this.ws_timer = null;

    this.port = port;
    this.uri = uri;
    this.protocol = protocol;

    this.ws = null;
    this.connect_period = 3000;  // when no connection new try every period (ms)
  }

  // Methods that can be overwritten in the child classes
  onopen(){}
  onmessage(data){}
  onclose(){}

  start(){
    this.ws = new WebSocket("ws://" + document.domain + ":" + this.port + "/" + this.uri, this.protocol);

    this.ws.onopen = (event) => {
      console.log(`[ws_open] ${this.protocol} opened`);
      // Stop connection tries
      if(this.ws_timer){
        clearTimeout(this.ws_timer);
        this.ws_timer = null;
      }

      this.onopen();
    };

    // Parse status JSON and show info
    this.ws.onmessage = (event) => {
      //console.log(`[ws_message] : ${event.data}`);
      this.onmessage(event.data);

      let json = JSON.parse(event.data);

      // Execute listeners callback-functions
      for(let callback of this.listeners){
        callback(json);
      }
      
    };

    this.ws.onclose = (event) => {
      if (event.wasClean) {
        console.log(`[ws_close] Соединение закрыто чисто, код=${event.code} причина=${event.reason}`);
      } else {
        // например, сервер убил процесс или сеть недоступна
        // обычно в этом случае event.code 1006
        console.log('[ws_close] Соединение прервано');
      }

      // Try to connect again if server is down for some reason
      this.ws_timer = setTimeout( () => { this.start(); }, this.connect_period);

      this.onclose();
    };
  }

  /*
  * Add callback functions for status data processing
  *   @callback  function to be called when status json acquired from web socket
  */
  add_listener(callback){
    this.listeners.push(callback);
  }

  /*
  * Remove callback function for status data processing
  *   @callback  
  */
  remove_listener(callback){
    const idx = this.listeners.indexOf(callback)
    if(idx > -1){
      this.listeners.splice(idx, 1);
    }
  }

  /*
  * Check if such callback already set as status listener
  *   @callback  function to check
  */
  is_listener_set(callback){
    if( this.listeners.indexOf(callback) === -1 ) return false;

    return true;
  }

}


// --------------------------- CNC status channel -------------------------

class CNCStatusListener extends SocketListener{

  constructor(){
    super(8888, "websocket/linuxcnc_status", "linuxcnc_status");
    this.cnc_is_available = false;
    this.cnc_avail_timer = null;
  }

  cnc_is_down()
  {
    this.cnc_is_available = false;
    console.warn("[linuxcnc] is not available");

    console.log(this);
    // Hide page elements
    document.getElementById("cnc_availability").style.visibility = "visible";
    //document.querySelector( "body" ).classList.add( "hidden" );
  }

  cnc_is_up()
  {
    this.cnc_is_available = true;
    console.log("[linuxcnc] is available");
    // Show page elements
    console.log(this);
    //document.querySelector( "body" ).classList.remove( "hidden" );
    document.getElementById("cnc_availability").style.visibility = "hidden";

    //update_page_content();
  }

  onopen(){
    // Start cnc avail timer
    this.cnc_avail_timer = setTimeout( () => { this.cnc_is_down(); }, 1000);
  }

  onmessage(data){
    // Refresh availability timer
    clearTimeout(this.cnc_avail_timer);
    this.cnc_avail_timer = setTimeout( () => { this.cnc_is_down(); }, 1000);

    // Update internal cnc state
    if( !this.cnc_is_available ) this.cnc_is_up();
  }

  onclose(){
    clearTimeout(this.cnc_avail_timer);
  }

}

let status_listener = new CNCStatusListener();

/*
* Start web socket for Current CNC status listener 
*   @param  
*/
export function init_cnc_status_listener()
{
  status_listener.start();
}

// --------------------------- CNC errors channel -------------------------

class CNCErrorsListener extends SocketListener{

  constructor(){
    super(8888, "websocket/linuxcnc_errors", "linuxcnc_errors");
    this.cnc_is_available = false;
    this.cnc_avail_timer = null;
  }

}

let errors_listener = new CNCErrorsListener();

/*
* Start web socket for Current CNC errors listener 
*   @param  
*/
export function init_cnc_errors_listener()
{
  errors_listener.start();
}

// ------------------------ CNC Control bar switcher -----------------------

class ControlBarSwitcher{
  constructor(){
    this.init_controls();
  }

  init_controls(){
    let manual_btn = document.getElementById("but_manual_control");
    let mdi_btn = document.getElementById("but_mdi_control");

    function switch_control_bar(control_type){

      // TODO: make non-blocking alert
      let fail_cb = (resp) => { alert(`[control_switcher] (${resp.result.code}): ${resp.result.text}`); };

      switch(control_type){

        case "manual":
          CNC.set_task_mode("manual", null, fail_cb);
        break;

        case "mdi":
          CNC.set_task_mode("mdi", null, fail_cb);
        break;

      }
    }

    manual_btn.onclick = () => { switch_control_bar("manual"); };
    mdi_btn.onclick = () => { switch_control_bar("mdi"); };
  }

  show_manual_bar(){
    document.getElementById("bar_mdi_control").style.visibility = "hidden";
    document.getElementById("bar_manual_control").style.visibility = "visible";
  }

  show_mdi_bar(){
    document.getElementById("bar_mdi_control").style.visibility = "visible";
    document.getElementById("bar_manual_control").style.visibility = "hidden";
  }
}

let cbs = new ControlBarSwitcher();

// --------------------------- Manual Controls -------------------------

class ManualControlMenu{

  constructor() 
  {
    this.init_move_speed_slider();
    this.init_move_axis_buttons();
  }

  init_move_speed_slider()
  {
    let axis_speed_slider = document.getElementById("axis_move_speed");
    let axis_speed_output = document.getElementById("axis_move_speed_value");
    axis_speed_output.innerHTML = axis_speed_slider.value;

    axis_speed_slider.oninput = function() {
      axis_speed_output.innerHTML = this.value;
    }
  }

  static move_axis(direction)
  {
    let move = {};
    move.data = {};
    let axis_radio = document.getElementsByName("active_axis");
    for(let i = 0; i < axis_radio.length; ++i){
      if(axis_radio[i].checked) move.data.axis_number = Number(axis_radio[i].value);
    }

    let move_step = (document.getElementById("axis_step").value);
    move.type = "increment";

    switch(move_step){
      case "Постоянный": 
        move.type = "continuous";
        break;

      case "0.1 мм":
        move.data.distance = 0.1;
        break;

      case "1 мм":
        move.data.distance = 1;
        break;

      case "10 мм":
        move.data.distance = 10;
        break;
    }

    // Convert speed [mm\min] back to cnc velocity value
    move.data.velocity = Number(document.getElementById("axis_move_speed").value) / 60;

    if(direction == "neg") {
      //if(move.data.distance !== undefined) move.data.distance *= (-1);
      move.data.velocity *= (-1);
    }

    //console.log("move_axis called with values: ");
    //console.log(move);

    CNC.move_axis(move.type, move.data);

    return move;
  }

  init_move_axis_buttons()
  {
    let move_pos_id = document.getElementById("but_axis_move_pos");
    let move_neg_id = document.getElementById("but_axis_move_neg");

    function mouse_down_callback(event){
      //console.log(this.id);
      let direction = "pos";
      if(this.id.includes("neg")) direction = "neg";

      if (event.button !== 0) return;

      let move = ManualControlMenu.move_axis(direction);
      if (move.type == "continuous"){

        function listener (event){
          CNC.move_axis("stop", {"axis_number": move.data.axis_number});
          //console.log("mouseup listener called");
        }

        // Stop continuous movement when button released
        window.addEventListener("mouseup", listener, {once:true});
      }
    }

    // link buttons context to callback functions
    let move_pos_cb = mouse_down_callback.bind(move_pos_id);
    let move_neg_cb = mouse_down_callback.bind(move_neg_id);

    move_neg_id.addEventListener("mousedown", move_neg_cb);
    move_pos_id.addEventListener("mousedown", move_pos_cb);
  }

  toggle_controls(show)
  {
    let nodes = document.getElementById("bar_manual_control").getElementsByTagName('*');

    if(show){
      for(let i = 0; i < nodes.length; i++){
        nodes[i].disabled = false;
      }
    }
    // Hide controls
    else{
      for(let i = 0; i < nodes.length; i++){
        nodes[i].disabled = true;
      }
    }
  }

}

// ---------------------------  MDI  Controls  -------------------------

class MDIControlMenu{
  constructor(){
    this.cmd_input = document.getElementById("mdi_cmd_line");
    this.cmd_input.value = "";

    this.init_controls();
  }

  init_controls(){
    let run_btn = document.getElementById("but_mdi_run");

    run_btn.onclick = () => { 
      CNC.run_mdi(this.cmd_input.value); 
      this.cmd_input.value = "";
    };
  }
}


let mdi_ctrl = new MDIControlMenu();



// --------------------------- G-code Controls -------------------------

class GcodeControlMenu{

  constructor()
  {
    this.paused = false;
    this.opened_file = "";

    // G-CODE content output id
    this.output = document.getElementById("ngc_file_content");

    // G-CODE Controls ids
    this.start_button = document.getElementById("gcode_start");
    this.step_button = document.getElementById("gcode_step");
    this.pause_button = document.getElementById("gcode_pause");
    this.stop_button = document.getElementById("gcode_stop");
    this.open_button = document.getElementById("ngc_file_open");

    // map <line_no> - <tool_no> from gcode file content
    this.tools = new Map();

    this.init_controls();
  }

  static select_textarea_line(id, lineNum)
  {
      lineNum--; // array starts at 0
      let tarea = document.getElementById(id);
      let lines = tarea.value.split("\n");
      if(lines === undefined) return;

      // calculate start/end
      let startPos = 0;
      let endPos = tarea.value.length;
      for (let x = 0; x < lines.length; x++) {
        if (x == lineNum) {
            break;
        }
        startPos += (lines[x].length + 1);
      }
      
      try{
        endPos = lines[lineNum].length + startPos;
      }
      catch (err){
        return;
      }
      
      // do selection
      // Chrome / Firefox
      if (typeof(tarea.selectionStart) != "undefined") {
        tarea.focus();
        tarea.selectionStart = startPos;
        tarea.selectionEnd = endPos;
        return true;
      }

      // IE
      if (document.selection && document.selection.createRange) {
        tarea.focus();
        tarea.select();
        let range = document.selection.createRange();
        range.collapse(true);
        range.moveEnd("character", endPos);
        range.moveStart("character", startPos);
        range.select();
        return true;
      }

      return false;
  }

  toggle_pause_button(paused)
  {
    if(paused){
      this.paused = true;
      this.pause_button.innerHTML = "Resume";
    }
    else{
      this.paused = false;
      this.pause_button.innerHTML = "Pause";
    }
  }

  toggle_controls(show)
  {
    let control_elems = document.getElementById("gcode_control").children;
    // Going throw collection of elements
    if(show){
      this.start_button.disabled = false;
      this.step_button.disabled = false;
      this.open_button.disabled = false;
    }
    else{
      for (let elem of control_elems){
        //console.log(elem);
        if(elem.tagName.toUpperCase() == "BUTTON") elem.disabled = true;
      }
      this.open_button.disabled = true;
    } 
  }

  static clear_current_gcode()
  {
    for (let i = scene.children.length - 1; i >= 0; i--) {
      //console.log(scene.children[i].name);
      if(scene.children[i].name === "gcode"){

          //console.log(`geom: ${scene.children[i].geometry}, material: ${scene.children[i].material}`);

          // Free memory
          if(scene.children[i].geometry !== undefined){
            scene.children[i].geometry.dispose();
            scene.children[i].material.dispose();
            //scene.children[i].Texture.dispose();
          }
          
          scene.remove(scene.children[i]);
      }
    }

    renderer.renderLists.dispose();
  }

  static backplot_gcode(content)
  {
    console.log('[backplot_gcode]');

    // Remove current gcode object
    GcodeControlMenu.clear_current_gcode();

    // Add new gcode object to scene
    const gloader = new NGCodeLoader();
    gloader.parse(content, function (object){
      scene.add( object );
      render();
    });
  }

  update_tools(content)
  {
    let gcode_lines = content.split('\n');;
    //console.log(gcode_lines);

    this.tools.clear();

    for (let i = 0; i < gcode_lines.length; ++i) {
      //console.log(` Searching tools at line: '${gcode_lines[i]}' `);

      // Searching for T-command and it's argument as tool number. Output -  array of matches
      let tool = gcode_lines[i].match( /(?<![;(].*)(t(\d+)\s?)+/i );
      //console.log(tool);
      if (tool) this.tools.set(i+1, +tool[2]);
    }

    console.log(this.tools);
  }

  update_content()
  {
    // Update current gcode file content
    let gcode_content_promise = CNC.get_gcode_content();

    gcode_content_promise.then(
      (json) => {
        console.log("gcode content load success!");
        this.output.textContent = "";
        this.output.textContent = json.content;
        GcodeControlMenu.backplot_gcode(json.content);
        this.update_tools(json.content);
      },
      (error) => {
        console.warn(`gcode content load error: ${error.message}`);
      }
    );
    gcode_content_promise.catch( error => console.warn(` Ошибка загрузки содержимого g-code: ${error.message}`) );
  }

  update_current_line(line_no)
  {
    console.log(`Updating texarea line to ${line_no}`);
    document.getElementById("gcode_line_value").innerHTML = line_no;
    if(this.output !== undefined) GcodeControlMenu.select_textarea_line("ngc_file_content", line_no);
  }

  start(line_no=0)
  {
    CNC.start_gcode(line_no, null, null);
  }

  stop()
  {
    CNC.stop_gcode(() => { this.pause_button.disabled = true;
                           this.stop_button.disabled = true; }, 
                    null);
  }

  step()
  {
    CNC.step_gcode(() => { this.pause_button.disabled = false;
                           this.stop_button.disabled = false; }, 
                    null);
  }

  pause()
  {
    if (this.paused){
      CNC.resume_gcode(() => { this.pause_button.disabled = false; }, null);
    }
    else{
      CNC.pause_gcode(() => { this.pause_button.disabled = false; }, null);
    }
  }

  set_opened_file(file_name)
  {
    if(this.opened_file !== file_name){
      this.update_content();
    }

    this.opened_file = file_name;
  }

  init_controls()
  {
    // Add buttons handlers
    this.start_button.onclick = () => this.start(0);
    this.step_button.onclick = () => this.step();
    this.pause_button.onclick = () => this.pause();
    this.pause_button.disabled = true;
    this.stop_button.onclick = () => this.stop();
    this.stop_button.disabled = true;
    let object = this;

    let input = document.getElementById("ngc_file_open");
       
    input.addEventListener("change", function () {
      if (this.files && this.files[0]) {
        const myFile = this.files[0];
        const reader = new FileReader();
        
        reader.onload = function (e) {
          
          let ok_callback = () => {
            //object.output.textContent = "";
            //object.output.textContent = e.target.result;
            object.toggle_controls(true);
            // Save array of strings of g-code file in memory
            //object.update_tools(e.target.result);
            alert("Файл загружен успешно");
          }

          let fail_callback = function(res){
            alert(`Ошибка при отправке файла (${res.result.code}): ${res.result.text}`);
          }

          if(myFile.name.indexOf(".ngc") < 0){
            alert("Недопустимый формат файла. Требуется расширение .ngc");
            return;
          }

          // Load g-code to CNC
          CNC.send_gcode_file(myFile.name, e.target.result, ok_callback, fail_callback);

          // Plot g-code
          //GcodeControlMenu.backplot_gcode(e.target.result);
        }

        reader.onerror = function(e) {
          console.log(reader.error);
        }

        reader.onprogress = function(e) {
          console.log(`FileLoader bytes loaded: ${e.loaded}`);
        }
        
        // reader.readAsBinaryString(myFile);  // Deprecated !
        reader.readAsText(myFile);
      }
    });

  }

}




// --------------------------- Machine State Controls -------------------------


// ManualControl Bar
let mc = new ManualControlMenu();

// Gcode Bar
let gc = new GcodeControlMenu();

class StatusControl{
  constructor()
  {
    // Previous cnc status values
    this.prev_cnc_status = {
      task_mode: "", 
      task_state: "", 
      interp_state: "", 
      gcode_file: "",
      motion_line: 0,
      motion_mode: "",
      motion_type: null,
      command: "",
      tool_in_spindle: null,
    };

    console.log('StatusControl constructor called');
  }

  // Send command to change CNC state
  static set_state(state)
  {
    CNC.set_state(state, () => { console.log("OK!") });
  }

  // Vizualization of current CNC state
  update_current_state(cnc_status)
  {
    if(cnc_status.task_state === this.prev_cnc_status.task_state) {
      return;
    }

    console.log("New CNC state. estop: " + cnc_status.estop + " task_state: " + cnc_status.task_state);

    function toggle_estop(state){
      let id = document.getElementById("but_estop");
      id.onclick = state ? () => { StatusControl.set_state('estop_reset') } : () => { StatusControl.set_state('estop') };
    }

    function toggle_state(state){
      let id = document.getElementById("but_power");
      id.onclick = state ? () => { StatusControl.set_state('off')} : () => { StatusControl.set_state('on')};
    }

    // CNC is stopped
    if(cnc_status.estop == "estop"){
      toggle_estop(true);
      mc.toggle_controls(false);  //toggle_manual_controls(false);
      document.getElementById("but_estop").classList.add("css-button-pressed");
      document.getElementById("but_power").disabled = true;
      document.getElementById("cnc_state_value").innerHTML = "АВОСТ";
      gc.toggle_controls(false);  //toggle_gcode_controls(false);
      tte.toggle_reload_btn(false);
    }
    // CNC is ready but powerred off
    else{
      toggle_estop(false);
      mc.toggle_controls(false);  //toggle_manual_controls(false);
      document.getElementById("but_estop").classList.remove("css-button-pressed");
      document.getElementById("but_power").disabled = false;
      document.getElementById("cnc_state_value").innerHTML = "ВЫКЛ";
      gc.toggle_controls(false);  //toggle_gcode_controls(false);
      tte.toggle_reload_btn(false);
      //document.getElementById("but_estop").setAttribute("onclick","control_state('estop')");
    }

    // CNC is On
    if(cnc_status.task_state == "on"){
      toggle_state(true);
      mc.toggle_controls(true);  //toggle_manual_controls(true);
      document.getElementById("but_power").classList.add("css-button-pressed");
      document.getElementById("cnc_state_value").innerHTML = "ВКЛ";
      gc.toggle_controls(true);  //toggle_gcode_controls(true);
      tte.toggle_reload_btn(true);
    }
    // CNC is Off
    else if(cnc_status.task_state == "off"){
      toggle_state(false);
      mc.toggle_controls(false);  //toggle_manual_controls(false);
      document.getElementById("but_power").classList.remove("css-button-pressed");
      document.getElementById("cnc_state_value").innerHTML = "ВЫКЛ";
      gc.toggle_controls(false);  //toggle_gcode_controls(false);
      tte.toggle_reload_btn(false);
    }

    this.prev_cnc_status.task_state = cnc_status.task_state;
  }

  // 
  update_controls(cnc_status)
  {
    // task_mode: [ 'manual', 'auto', 'mdi' ] 
    if(this.prev_cnc_status.task_mode != cnc_status.task_mode){

      console.log(`New CNC task_mode: ${cnc_status.task_mode}`);
      
      switch(cnc_status.task_mode){
        case "manual":
          // Show Manual Control Bar
          cbs.show_manual_bar();
          break;

        case "auto":
          // Show gcode controls
          if(cnc_status.task_state == "on") gc.toggle_controls(true); //toggle_gcode_controls(true);
          break;

        case "mdi":
          // Show MDI Control Bar
          cbs.show_mdi_bar();
          break;
      }

      this.prev_cnc_status.task_mode = cnc_status.task_mode;
    }

    // interp_state : [ 'idle', 'reading', 'paused', 'waiting' ]
    if(this.prev_cnc_status.interp_state != cnc_status.interp_state){
      console.log(`New CNC interp_state: ${cnc_status.interp_state}`);

      switch(cnc_status.interp_state){
        case "idle":
          // When CNC is ON Show manual controls
          if(cnc_status.task_state == "on") {
            gc.start_button.disabled = false;
            mc.toggle_controls(true);  //toggle_manual_controls(true);
            gc.open_button.disabled = false;
          }
          gc.pause_button.disabled = true;
          gc.stop_button.disabled = true;
          gc.toggle_pause_button(false);  //toggle_gcode_pause_button(false);
          break;

        // When CNC is running gcode hide manual controls 
        case "paused":
          gc.toggle_pause_button(true);  //toggle_gcode_pause_button(true);
          mc.toggle_controls(false); //toggle_manual_controls(false);
          break;

        case "reading":
        case "waiting":
          gc.start_button.disabled = true;
          gc.pause_button.disabled = false;
          gc.stop_button.disabled = false;
          gc.open_button.disabled = true;
          gc.toggle_pause_button(false);  //toggle_gcode_pause_button(false);
          mc.toggle_controls(false); //toggle_manual_controls(false);
          break;
      }

      this.prev_cnc_status.interp_state = cnc_status.interp_state;
    }

    // curremt g-code interpreter command
    if( (this.prev_cnc_status.command != cnc_status.command) || 
        (this.prev_cnc_status.motion_type != cnc_status.motion_type))
    {
      console.log(`G-code Interpreter command: ${cnc_status.command}`);
      console.log(`Motion type: ${cnc_status.motion_type}`);

      // Check if tool-change needed
      if( cnc_status.command.includes("M6") && 
         (cnc_status.interp_state === "reading") && 
         (cnc_status.motion_type === 0) )
      {
        console.log(`tool-change checking`);

          let tool_no = undefined;
           // Take last tool from map that is in line <= interpreter read_line
          for(let key of gc.tools.keys()){
            if (key > cnc_status.read_line) break;

            tool_no = gc.tools.get(key);
          }

          if( tool_no !== undefined ){
            if( this.prev_cnc_status.tool_in_spindle != tool_no){
              if(confirm(`Поставьте инструмент ${tool_no} и нажмите OK`)){
                // resume g-code execution
                CNC.change_tool(null, null);
              }
              else{
                //gc.stop();
              }
            }
          }
          else{
            console.warn(`No tool number found for changing at line ${cnc_status.read_line}`);
          }
      }

      this.prev_cnc_status.command = cnc_status.command;
      this.prev_cnc_status.motion_type = cnc_status.motion_type;
    }
    
    // current tool
    if(this.prev_cnc_status.tool_in_spindle != cnc_status.tool_in_spindle){
      document.getElementById("cnc_tool_value").innerHTML = cnc_status.tool_in_spindle ? cnc_status.tool_in_spindle : "Отсутствует";
      this.prev_cnc_status.tool_in_spindle = cnc_status.tool_in_spindle;
    }

    // current g-code file
    if(this.prev_cnc_status.gcode_file != cnc_status.file){
      document.getElementById("cnc_file_value").innerHTML = cnc_status.file;
      this.prev_cnc_status.gcode_file = cnc_status.file;
      gc.set_opened_file(cnc_status.file);
    }

    // current g-code line
    if(cnc_status.motion_line && (this.prev_cnc_status.motion_line !== cnc_status.motion_line)){
      gc.update_current_line(cnc_status.motion_line);
      this.prev_cnc_status.motion_line = cnc_status.motion_line;
    }
  }

}

let sc = new StatusControl();

// 
export function init_state_controls()
{
  document.getElementById("but_estop").onclick = function() { StatusControl.set_state('estop_reset'); };
  document.getElementById("but_power").onclick = function() { StatusControl.set_state('on'); };
  document.getElementById("but_home").onclick = function() { CNC.home_all(); };

  // NOTE: Use lambda expressions to make object's this bind to methods
  status_listener.add_listener( (status) => sc.update_current_state(status) );
  status_listener.add_listener( (status) => sc.update_controls(status) );

  // CNC errors visualization
  errors_listener.add_listener( (error) => alert(`Ошибка выполнения: ${error.text}`) );

  // CNC restart button (when linuxcnc is unavailable for some reason)
  document.getElementById("but_restart_cnc").onclick = function() { CNC.cnc_start_stop("start_cnc", null, null); };
}

// --------------------------- Tool Table Editor -------------------------

class ToolTableEditor{

  constructor(){
    this.row_ids = 1;               // Unique row id counter (First row is a table header)
    this.window_opened = false;
    this.unique_params = { T: new Set(), P: new Set() };
 // Current tools numbers in the table   (must be unique)
 // Current pockets numbers in the table (must be unique)
     
    this.delete_id = document.getElementById("but_tool_delete");
    this.delete_tools = new Set();  // Tools numbers to delete

    // column_name <-> json parameter
    this.columns = new Map([
      ["Del", "Del"],
      ["TOOL", "T"],
      ["POC", "P"],
      ["X", "X"],
      ["Y", "Y"],
      ["Z", "Z"],
      ["A", "A"],
      ["B", "B"],
      ["C", "C"],
      ["U", "U"],
      ["V", "V"],
      ["W", "W"],
      ["DIAM", "D"],
      ["FRONT", "I"],
      ["BACK", "J"],
      ["ORIEN", "Q"],
      ["COMMENT", ";"],
    ]);      

    this.init_header();
    this.init_controls();
    this.reread();
  }

// 
  init_header(){
    let thead = document.getElementById("tool_table_header");
    let row = document.createElement("TR");

    for(let col of this.columns.keys()){

      let th = document.createElement("TH");
      let text = document.createTextNode(col);
      th.appendChild(text);
      if( col !== "COMMENT" ) th.classList.add("tool_table_cell");
      else th.classList.add("tool_table_comment_cell");
      th.align = "center";

      row.appendChild(th);
    }

    thead.appendChild(row);
  }

  init_controls(){
    document.getElementById("but_tool_edit_open").onclick = () => {  
      if(this.window_opened){
        document.getElementById("tool_table_window").style.visibility = "hidden";
        this.window_opened = false;
        document.getElementById("but_tool_edit_open").classList.remove("css-button-pressed");
      }
      else{
        document.getElementById("tool_table_window").style.visibility = "visible";
        this.window_opened = true;
        document.getElementById("but_tool_edit_open").classList.add("css-button-pressed");
      }
    }

    document.getElementById("but_tool_close").onclick = () => {  
      document.getElementById("tool_table_window").style.visibility = "hidden";
      this.window_opened = false;
      document.getElementById("but_tool_edit_open").classList.remove("css-button-pressed");
    }

    this.delete_id.disabled = true;
    this.delete_id.onclick = () => {
      console.log(this.delete_tools);

      for( let tr_id of this.delete_tools ){
        let tool_num = this.get_column_param(tr_id, "T");
        let poc_num = this.get_column_param(tr_id, "P");
        this.delete_row_by_id(tr_id);
        // Remove deleted tool data from local storages
        if(this.unique_params["T"].delete(tool_num)) console.log(`[tool_table] tool ${tool_num} removed from local storage`);
        if(this.unique_params["P"].delete(poc_num)) console.log(`[tool_table] pocket ${poc_num} removed from local storage`);
      }

      this.delete_tools.clear();
      this.delete_id.disabled = true;

      /* Delete real tool from tool table file
      if(this.delete_tools.size){
        let ok_cb = (resp) => {
          this.reread();
        }

        let fail_cb = (resp) => {
          console.log(`[tool_table] delete failed result: ${resp.result.code}, ${resp.result.text}`);
        }

        let tools = Array.from(this.delete_tools);
        CNC.delete_tools(tools, ok_cb, fail_cb);
      }*/
      
    }

    document.getElementById("but_tool_add").onclick = () => {

      let date = new Date();
      let dtime = date.getFullYear() + '.' + (date.getMonth()+1)  + '.' + date.getDate();

      this.add_tool_row( {T: "NEW", P: "NEW", ';': `Added ${dtime}`}, true );
    }

    document.getElementById("but_tool_reread").onclick = () => {
      this.reread();
    }

    document.getElementById("but_tool_save").onclick = () => {

      let trs = document.getElementById("tool_table").rows;

      console.log(`[tool_table] Saving ${trs.length-1} rows`);

      let tools_data = [];    // Data from table inputs as array of ojects for json sending
      let errors = new Map(); //
      let unique_params = { T: new Set(), P: new Set() }; //
      // Check table fields validness
      for(let i = 1; i < trs.length; ++i){

        let id = this.get_row_id(i);
        let tool_data = this.check_and_capture_row_inputs(id, unique_params, errors);

        tools_data.push(tool_data);
      }

      if(errors.size){
        let msg = "";

        for( let entry of errors ){
          msg += entry[0] + ": " + entry[1];
          msg += '\n';
        }

        alert(msg);
      }
      // Update real file
      else{
        console.log(tools_data);

        let ok_cb = (resp) => {
          alert(`Файл успешно сохранен`);
        } 

        let fail_cb = (resp) => {
          alert(`Ошибка сохранения файла (${resp.result.code}): ${resp.result.text}`);
        }

        CNC.update_tools(tools_data, ok_cb, fail_cb);
      }

    }

    document.getElementById("but_tool_reload").onclick = () => {
      let ok_cb = (resp) => {
        alert(`Таблица инструментов успешно перезагружена в LinuxCNC`);
      } 

      let fail_cb = (resp) => {
        alert(`Ошибка перезагрузки таблица инструментов (${resp.result.code}): ${resp.result.text}`);
      }

      CNC.reload_tool_table(ok_cb, fail_cb);
    }

  }

  toggle_reload_btn(show){
    if(show){
      document.getElementById("but_tool_reload").disabled = false;
    }
    else{
      document.getElementById("but_tool_reload").disabled = true;
    }
  }

  reread(){
    
    let ok_cb = (json) => {

      this.delete_tool_rows();
      //this.tools.clear();
      //this.pockets.clear();
      for(let set in this.unique_params){
        this.unique_params[set].clear();
      }
      this.delete_tools.clear();
      this.delete_id.disabled = true;

      for(let i = 0; i < json.tools.length; ++i){
        this.add_tool_row(json.tools[i]);
      }
    }

    CNC.get_tools_data(ok_cb, null);
  }

  delete_row_by_id(row_id_str){
    let elem = document.getElementById(row_id_str);
    elem.parentNode.removeChild(elem);
  }

  delete_tool_rows(){
    let trs = document.getElementById("tool_table").rows;
    // remove every row except first one - that is table header
    while(trs.length > 1) trs[1].parentNode.removeChild(trs[1]);

    this.row_ids = 1;
  }

  get_row_id(row_num){
    let trs = document.getElementById("tool_table").rows;

    try{
      let id_str = trs[row_num].id;
      let id_num_str = id_str.replace("TR", "");
      return parseInt(id_num_str, 10);
    }
    catch{
      console.warn("Invalid row number");
      return -1;
    }

  }

  get_column_param(row_id_str, param_name){

    let id_num_str = row_id_str.replace("TR", "");
    let id_num = parseInt(id_num_str, 10);
    let param_in_id = param_name + id_num;
    // as number, not string
    let param_num = +document.getElementById(param_in_id).value;

    //console.log(`[tool_table] Row ${row_id_str} contains tool ${tool_num}`);

    return param_num; 
  }

  add_tool_row(tool_data, do_scroll=false){
    if( tool_data.T === undefined || tool_data.P === undefined){
      console.error("[tool_table] no tool number or pocket provided. Ignoring adding");
      return;
    }
/*
    function save_unique_param(param_name, set){
      if(tool_data[param_name] !== "NEW"){
        let param_num = +tool_data[param_name];

        if( set.has(param_num) ){
          console.warn(`[tool_table] ${param_name} (${param_num}) already exists. Ignoring adding`);
          return false;
        }

        set.add(param_num);
      }

      return true;
    }

    if( !save_unique_param('T', this.unique_params["T"]) ) return;
    if( !save_unique_param('P', this.unique_params["P"]) ) return;
*/
    let tbody = document.getElementById("tool_table").getElementsByTagName("TBODY")[0];
    let row = document.createElement("TR");
    row.id = "TR" + this.row_ids;

    for (let val of this.columns.values()){

      let td = document.createElement("TD");
      //td.align = "center";
      td.id = "TD" + val + this.row_ids;

      let text = "";
      if(tool_data[ val ] !== undefined) text = tool_data[ val ];

      // Make table field changable
      let input = document.createElement("input");
      input.id = val + this.row_ids;

      if(val === "Del"){
        input.type = "checkbox";
        input.onchange = (event) => {
          //console.log(`[tool_table] checkbox input: ${event.target.checked}`);

          if(event.target.checked) {
            // Add selected row for deletion
            //console.log(`[tool_table]  Adding row ${tool_num} for deletion`);
            this.delete_tools.add(row.id/*tool_num*/);
          }
          else{
            // remove selected row from deletion
            this.delete_tools.delete(row.id/*tool_num*/);
          }

          // Hide or Show Delete button
          if( this.delete_tools.size > 0 ){
            this.delete_id.disabled = false;
          }
          else{
            this.delete_id.disabled = true;
          }
        }
      }
      else{
        input.type = "text";
        input.placeholder = text;
        input.value = text;
        input.onfocus = function(ev) { this.style.color = "black"; };
      }

      input.classList.add("tool_table_input");

      if(val !== ";" ){
        td.classList.add("tool_table_cell");
        input.onkeypress = COMMON.validate_int;
      }
      else{
        // for comments
        td.classList.add("tool_table_comment_cell");
      }

      td.appendChild(input);

      //<input class="cell-input-ip input-text" id="T" type="text" name="ip4" placeholder="-" autocomplete="off" max="255" min="0" maxlength="3" value="">

      row.appendChild(td);
    }

    tbody.appendChild(row);
    ++this.row_ids;

    // Scroll to the end of the table
    if(do_scroll){
      let editor = document.getElementById("tool_table_body"/*"tool_table_editor"*/);
      editor.scrollTop = editor.scrollHeight;
    }
  }

  //
  check_and_capture_row_inputs(row_id, unique_params, errors_map=null){

    // Array of tool-data objects
    let captured_data = {};

    let tool_num = document.getElementById("T" + row_id).value;

    let add_error = (column, text) => {
      if(errors_map) errors_map.set(`Tool ${tool_num} <${column}>`, text);
    }

    // Start check from 1 column (Tool) except last column (Comment)
    for(let entry of this.columns){

      if(entry[1] === "Del") continue;

      let in_id_str = entry[1] + row_id;
      let in_id = document.getElementById(in_id_str);
      in_id.style.color = "black";  // reset from any previous errors
      let in_value = in_id.value;

      // Common numbers check: Positive and Negative float numbers or None are correct
      let regex = /^-?\d*\.?\d*$/;

      if ( (entry[1] !== ";" ) && !regex.test(in_value) ){
        in_id.style.color = "red";
        console.warn(`Row (${row_id}) ${in_id_str} invalid input format: ${in_value}`);
        add_error(entry[0], `недопустимый формат числа`);
        continue;
      }

      let val = +in_value;

      // Special values check
      switch(entry[1]){

        // Check TOOL and POC inputs
        case "T":
        case "P":
          if(in_value === ""){
            add_error(entry[0], `не может быть пустым`);
            continue;
          }

          if( !COMMON.is_integer(val) || (val < 0) ){
            in_id.style.color = "red";
            add_error(entry[0], `должен быть целым положительным`);
            continue;
          }

          if( unique_params[entry[1]].has(val) ){
            in_id.style.color = "red";
            add_error(entry[0], `не может быть определен несколько раз`);
            continue;
          }
          else{
            unique_params[entry[1]].add(val);
          }

          break;

        // Check FRONT, BACK inputs
        case "I":
        case "J":
          if(in_value === "") break;

          // Must be between -360 and 360
          if( (val < -360) || (val > 360) ){
            in_id.style.color = "red";
            add_error(entry[0], `должно быть между -360 и 360`);
            continue;
          }
          break;


        // Check ORIEN input
        case "Q":
          if(in_value === "") break;

          // Must be 0..9 integer
          if( !COMMON.is_integer(val) || (val < 0) || (val > 9) ){
            in_id.style.color = "red";
            add_error(entry[0], `должно быть целым от 0 до 9`);
            continue;
          }
          break;

      }

      // No errors occured => capture data
      if(in_value !== "") captured_data[entry[1]] = in_value;

    }
    
    return captured_data;
  }
}

let tte = new ToolTableEditor();