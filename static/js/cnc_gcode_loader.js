import {
	BufferGeometry,
	Euler,
	FileLoader,
	Float32BufferAttribute,
	Group,
	LineBasicMaterial,
	MeshBasicMaterial,
	LineSegments,
	Loader,
	Line,
	Vector3,
	Box3,
	RingGeometry,
	BoxGeometry,
	Mesh,
	CatmullRomCurve3,
} from './threejs/build/three.module.js';

import { BufferGeometryUtils } from './threejs/jsm/utils/BufferGeometryUtils.js';

	
class NGCodeLoader{

	constructor() {
		// map of <line_no> - <tool_no> from gcode file content
		this.tools = new Map();
	}

	get_tools_map() {
		return this,tools;
	}

	parse( text, onLoad=null, onProgress=null, onErro=null ) {

		//console.log("Parsing: " + data);

		// Object created from gcodes
		let geoms_array = [];
		let gcode_union = null;
		let ngc_object = new Group();
		ngc_object.name = 'ngcode';

		let state = { 	x: 0, y: 0, z: 0, e: 0, f: 0, 
						extruding: false, 
						relative: false, 
						scale: 1.0, 
						arc_plane: "XY", 
						arc_mode_inc: true, // incremental or absolute arc distance mode
		};

		function delta( v1, v2 ) {
			return state.relative ? v2 : v2 - v1;
		}

		function absolute( v1, v2 ) {
			return state.relative ? v1 + v2 : v2;
		}

		function get_circle_points(radius, center_point){
			console.log("Circle (R: " + radius + ", C: " + center_point.abscissa + ", " + center_point.ordinate + ") contains points:");
			for(let i = 0; i < 12; ++i){
				let angle = (Math.PI / 6) * i;
				let abscissa = (center_point.abscissa + radius * Math.cos(angle)).toFixed(4);
				let ordinate = (center_point.ordinate + radius * Math.sin(angle)).toFixed(4);

				console.log((30 * i) + "grad: (" + abscissa + ", " + ordinate + ")");
			}
		}

		function create_gcode_object()
		{
			const gcode_geom = BufferGeometryUtils.mergeBufferGeometries(geoms_array);

			//console.log("Gcode objects are merged to geom:");
			//console.log(gcode_geom);

			gcode_union = new Line(gcode_geom, new LineBasicMaterial({color: "yellow"}) );
 			gcode_union.name = "gcode";

 			geoms_array.length = 0;

 			if(onLoad) onLoad(gcode_union);

 			return gcode_union;
		}

		function add_line(start_pos, end_pos)
		{
		  const points = [];
		  const start = new Vector3(start_pos.x, start_pos.y, start_pos.z);
		  const end = new Vector3(end_pos.x, end_pos.y, end_pos.z);

		  points.push(start);
		  points.push(end);

		  //console.log("add_line:");
		  //console.log(start);
		  //console.log(end);

		  const geometry = new BufferGeometry().setFromPoints( points );
		  geoms_array.push(geometry);
		}


		// Distance between 2 points at plane
		function distance(start_point, end_point){
			let delta1 = end_point.abscissa - start_point.abscissa;
			let delta2 = end_point.ordinate - start_point.ordinate;

			return Math.sqrt(delta1 ** 2 + delta2 ** 2);
		}

		// Determine relation of the point (p_to_check) and straight line between p1 and p2
		function is_under_line(p1, p2, p_to_check){

			// Threshold line coefficients
			let a = p1.ordinate - p2.ordinate;
			let b = p2.abscissa - p1.abscissa;
			let c = p1.abscissa * p2.ordinate - p2.abscissa * p1.ordinate;
			//console.log("Threshold line: " + a + "x " + b + "y " + c);

			if( (a * p_to_check.abscissa + b * p_to_check.ordinate + c ) < 0 ){
				//console.log("Under line");
				return true;
			}

			return false ;
		}


		// Determine which coordinate to use as abscissa, ordinate and helix in selected plane
		function get_arc_points_at_plane(plane, start_pos, end_pos, arc_center=null)
		{

			let at_plane = { 
				start_point: {}, 
				end_point: {}, 
				arc_center_point: {}, 
				arc_start_point: {},
			};

			switch(plane){
				case "XY": {
					at_plane.start_point.abscissa = start_pos.x;
					at_plane.start_point.ordinate = start_pos.y;
					at_plane.start_point.helix = start_pos.z;

					at_plane.end_point.abscissa = end_pos.x;
					at_plane.end_point.ordinate = end_pos.y;
					at_plane.end_point.helix = end_pos.z;

					if(arc_center){
						// Absolute X, Y
						at_plane.arc_center_point.abscissa = arc_center.x;
						at_plane.arc_center_point.ordinate = arc_center.y;

						// NOTE: Arc start point should be moved by radius from center further
						at_plane.arc_start_point.abscissa = arc_center.x;	
						at_plane.arc_start_point.ordinate = arc_center.y;
					}
					
					break;
				}

				case "XZ": {
					at_plane.start_point.abscissa = start_pos.x;
					at_plane.start_point.ordinate = start_pos.z;
					at_plane.start_point.helix = start_pos.y;

					at_plane.end_point.abscissa = end_pos.x;
					at_plane.end_point.ordinate = end_pos.z;
					at_plane.end_point.helix = end_pos.y;

					if(arc_center){
						at_plane.arc_center_point.abscissa = arc_center.x;
						at_plane.arc_center_point.ordinate = arc_center.z;

						// Absolute X, Z
						at_plane.arc_start_point.abscissa = arc_center.x;
						at_plane.arc_start_point.ordinate = arc_center.z;
					}

					break;
				}
				case "YZ": {
					at_plane.start_point.abscissa = start_pos.y;
					at_plane.start_point.ordinate = start_pos.z;
					at_plane.start_point.helix = start_pos.x;

					at_plane.end_point.abscissa = end_pos.y;
					at_plane.end_point.ordinate = end_pos.z;
					at_plane.end_point.helix = end_pos.x;

					if(arc_center){
						at_plane.arc_center_point.abscissa = arc_center.y;
						at_plane.arc_center_point.ordinate = arc_center.z;

						// Absolute Y, Z
						at_plane.arc_start_point.abscissa = arc_center.y;
						at_plane.arc_start_point.ordinate = arc_center.z;
					}

					break;
				}
				default:
					console.warn("Unsupported plane type: " + plane);
			}

			return at_plane;
		}

		function fill_arc_points_array(plane, array, arc_length, arc_center_point, arc_radius, arc_start_angle, start_point, end_point, turns_num)
		{
			// We want N points for any arc to make it smooth
			let points_number = 30;
			let segment_rad = arc_length / points_number;/*Math.PI / 24;*/	// Arc segment angle

			// Helical movement
			let segment_pitch = 0;

			let helix_delta = end_point.helix - start_point.helix;
			if( helix_delta ){
				segment_pitch = helix_delta / points_number;
				segment_pitch /= turns_num;
				//console.log(`HELICAL MOVEMENT with pitch: ${segment_pitch}`);
			}

			let last_helix = 0;			// helix value after arc movement
			let last_turn_helix = 0;	// helix value after regular full turn movement

			// NOTE: starting circle from backwards from center point for radius value, counter-clock-wise
			//console.log(`arc_center_point: (${arc_center_point.abscissa}, ${arc_center_point.ordinate}), arc_radius: ${arc_radius}, arc_start_angle: ${arc_start_angle}, arc_length: ${arc_length}, segment_rad: ${segment_rad}`);

			switch(plane){

				case "XY": {
					//array.push(new Vector3(start_point.abscissa, start_point.ordinate, 0));
					for(let i = 0; i < points_number; ++i){

						// save helix value after arc movement for next turn
						last_helix = start_point.helix + i * segment_pitch;

						array.push( new Vector3(
							arc_center_point.abscissa - arc_radius * Math.cos(i * segment_rad + arc_start_angle), 
							arc_center_point.ordinate - arc_radius * Math.sin(i * segment_rad + arc_start_angle), 
							last_helix)
						);
					}

					//console.log(`last_helix: ${last_helix}`);

					// Add extra full turn as P key-word.
					// NOTE: For each P increment above 1 an extra full circle is added to the programmed arc
					segment_rad = 2 * Math.PI / points_number;

					for(let p = 1; p < turns_num; ++p){

						for(let i = 0; i < points_number; ++i){

							last_turn_helix = last_helix + (i+1) * segment_pitch;

							array.push( new Vector3(
								arc_center_point.abscissa - arc_radius * Math.cos(i * segment_rad + arc_start_angle + arc_length), 
								arc_center_point.ordinate - arc_radius * Math.sin(i * segment_rad + arc_start_angle + arc_length), 
								last_turn_helix)
							);
						}

						last_helix = last_turn_helix;
					}

					array.push(new Vector3(end_point.abscissa, end_point.ordinate, end_point.helix));
					break;
				}

				case "XZ": {
					for(let i = 0; i < points_number; ++i){

						last_helix = start_point.helix + i * segment_pitch;

						array.push( new Vector3(
							arc_center_point.abscissa - arc_radius * Math.cos(i * segment_rad + arc_start_angle), 
							last_helix, 
							arc_center_point.ordinate - arc_radius * Math.sin(i * segment_rad + arc_start_angle))
						);
					}

					// Add extra full turn as P key-word.
					// NOTE: For each P increment above 1 an extra full circle is added to the programmed arc
					segment_rad = 2 * Math.PI / points_number;

					for(let p = 1; p < turns_num; ++p){

						for(let i = 0; i < points_number; ++i){

							last_turn_helix = last_helix + (i+1) * segment_pitch;

							array.push( new Vector3(
								arc_center_point.abscissa - arc_radius * Math.cos(i * segment_rad + arc_start_angle + arc_length), 
								last_turn_helix,
								arc_center_point.ordinate - arc_radius * Math.sin(i * segment_rad + arc_start_angle + arc_length))
							);
						}

						last_helix = last_turn_helix;
					}

					array.push(new Vector3(end_point.abscissa, end_point.helix, end_point.ordinate));
					break;
				}

				case "YZ": {
					for(let i = 0; i < points_number; ++i){

						last_helix = start_point.helix + i * segment_pitch;

						array.push( new Vector3(
							last_helix, 
							arc_center_point.abscissa - arc_radius * Math.cos(i * segment_rad + arc_start_angle), 
							arc_center_point.ordinate - arc_radius * Math.sin(i * segment_rad + arc_start_angle))
						);
					}

					// Add extra full turn as P key-word.
					// NOTE: For each P increment above 1 an extra full circle is added to the programmed arc
					segment_rad = 2 * Math.PI / points_number;

					for(let p = 1; p < turns_num; ++p){

						for(let i = 0; i < points_number; ++i){

							last_turn_helix = last_helix + (i+1) * segment_pitch;

							array.push( new Vector3(
								last_turn_helix,
								arc_center_point.abscissa - arc_radius * Math.cos(i * segment_rad + arc_start_angle + arc_length), 
								arc_center_point.ordinate - arc_radius * Math.sin(i * segment_rad + arc_start_angle + arc_length))
							);
						}

						last_helix = last_turn_helix;
					}

					// Add end point
					array.push(new Vector3(end_point.helix, end_point.abscissa, end_point.ordinate));
					break;
				}

				default:
					console.warn("Unsupported plane type: " + plane);
			}

			//console.log(array);
		}

		// Creates requested arc as curve geometry 
		function create_arc( {plane="XY", start_pos, end_pos=start_pos, arc_center_pos, clockwise, turns_num=1} )
		{
			// Determine arc coordinates at selected plane
			const at_plane = get_arc_points_at_plane(plane, start_pos, end_pos, arc_center_pos);

			// Points absolute coordinates in selected plane
			let start_point = at_plane.start_point;
			let end_point = at_plane.end_point;
			let arc_center_point = at_plane.arc_center_point;
			let arc_start_point = at_plane.arc_start_point;

			// When no end-point provided, or end-point is equal to startipoint we draw the full circle
			let arc_start_angle = 0;		// offset os tart point ib radians
			let arc_length = Math.PI * 2;	// length in radians

			const arc_radius = distance(start_point, arc_center_point);
			const arc_radius2 = distance(arc_center_point, end_point);
			let radius_delta = Math.abs(arc_radius2 - arc_radius);

			// It is an error when the arc is projected on the selected plane, the distance from the  
			// current point to the center differs from the distance from the end point to the center  
			// by more than (.05 inch/.5 mm) OR ((.0005 inch/.005mm) AND .1% of radius).
			if((start_point.helix - end_point.helix) === 0){
				//console.log("radius_delta: " + radius_delta);
				if( radius_delta > 0.5 || ( (radius_delta > 0.005) && (radius_delta > 0.001 * arc_radius) ) ){
					console.warn("Radius to end of arc differs from radius to start (r1: " + arc_radius + ", r2: " + arc_radius2 + ")");
					return;
				}
			}
			
			let swapped = false;
			// By default we are making CCW-arc in XY, YZ planes, and CW-arc in XZ plane
			// Swap start at end points to use CCW just as CW
			if( (clockwise && (plane !== "XZ")) || (!clockwise && (plane === "XZ")) ){
				//console.log("Creating CW arc");
				const tmp_point = end_point;
				end_point = start_point;
				start_point = tmp_point;
				swapped = true;
			}

			// Returns angle in radians of isosceles triangle 
			function cosinus_theoreme(opposite_side, adjacent_side)
			{
				const tmp = 1 - (opposite_side ** 2) / (2 * (adjacent_side ** 2));

				if(tmp > 1) return Math.acos(1);
				if(tmp < -1) return Math.acos(-1);

				return Math.acos(tmp);
			}

			// Counting that arc-start-point moved backward from center by abscissa for radius value;
			arc_start_point.abscissa -= arc_radius;
				
			let to_arc = distance(start_point, arc_start_point);

			// Offset angle of arc start as top angle of triangle with [R, R, to_arc] sides
			// Determine direction of arc-start offset: for posivite move - negative offset 
			let coef = (arc_center_point.ordinate > start_point.ordinate) ? 1 : -1;
			arc_start_angle = coef * cosinus_theoreme(to_arc, arc_radius);

			// Distance between start and end points
			let to_end = distance(start_point, end_point);

			// Calculate circle center angle as top angle of triangle with [R, R, to_end] sides
			arc_length = cosinus_theoreme(to_end, arc_radius);

			// Threshold point of ratotatin is 180 angle about start point via arc center
			let threshold_point = {};
			threshold_point.abscissa = 2 * arc_center_point.abscissa - start_point.abscissa;
			threshold_point.ordinate =  2 * arc_center_point.ordinate - start_point.ordinate;
			//console.log("Threshold point: " + threshold_point.abscissa + ", " + threshold_point.ordinate);

			// Movement compensation when making more then half circle
			if( !is_under_line(start_point, arc_center_point, end_point) ) {
				//console.warn("More than half circle movement. Rotating");
				arc_length = 2 * Math.PI - arc_length;
			}

			// Prepare to draw a curve
			let curve_points = [];
			fill_arc_points_array(plane, curve_points, arc_length, arc_center_point, arc_radius, arc_start_angle, start_point, end_point, turns_num);
			
			// Create the final object to add to the scene
			let curve = new CatmullRomCurve3(curve_points);
			let points = curve.getPoints(100);
			// When start and stop points are swapped, array must be reversed to avoid extra Line from start to end 
			if(swapped) points = points.reverse(); 
			//console.log(points);
	  		const geometry = new BufferGeometry().setFromPoints( points );
			//const material = new LineBasicMaterial( { color : "yellow" } );
			
			//const curveObject = new Line( geometry, material );
			geoms_array.push(geometry);
			//ngc_object.add(curveObject);

			/* DEBUG - Test points */
			const center_geom = new BoxGeometry(0.2, 0.2, 0.2);
			const center_mat = new MeshBasicMaterial({color: "yellow", wireframe: true});
			const center = new Mesh(center_geom, center_mat);
			center.position.set( arc_center_pos.x, arc_center_pos.y, arc_center_pos.z );
			ngc_object.add( center );

			const tp_start_geom = new BoxGeometry(0.1, 0.1, 0.1);
			const tp_start_mat = new MeshBasicMaterial({color: "pink", wireframe: true});
			const tp_start = new Mesh(tp_start_geom, tp_start_mat);
			tp_start.position.set( start_pos.x, start_pos.y, start_pos.z );
			ngc_object.add( tp_start );

			const tp_end_geom = new BoxGeometry(0.1, 0.1, 0.1);
			const tp_end_mat = new MeshBasicMaterial({color: "green", wireframe: true});
			const tp_end = new Mesh(tp_end_geom, tp_end_mat);
			tp_end.position.set( end_pos.x, end_pos.y, end_pos.z );
			ngc_object.add( tp_end );
			
		}

		// mode: true - incremental, false - absolute
		function add_arc_center_format( {mode, plane="XY", start_pos, end_pos=start_pos, center_offset, clockwise, turns_num=1} )
		{
/*
			console.log(`[add_arc_center_format]
\tplane: "${plane}",
\tstart_pos: (${start_pos.x}, ${start_pos.y}, ${start_pos.z}),
\tend_pos: (${end_pos.x}, ${end_pos.y}, ${end_pos.z}),
\tcenter_offset: (${center_offset.i}, ${center_offset.j}, ${center_offset.k})`);
*/
			let arc_center = {};

			if(mode){
				// Relative to start position (INCREMENTAL I,J,K MODE)
				arc_center.x = start_pos.x + center_offset.i;
				arc_center.y = start_pos.y + center_offset.j;
				arc_center.z = start_pos.z + center_offset.k;
			}
			else{
				// Absolute values
				arc_center.x = center_offset.i;
				arc_center.y = center_offset.j;
				arc_center.z = center_offset.k;
			}

			create_arc( {
				plane: plane, 
				start_pos: start_pos,
				end_pos: end_pos,
				arc_center_pos: arc_center,
				clockwise: clockwise,
				turns_num: turns_num,
			});
		}

		function get_arc_center_at_plane(plane, start_pos, center)
		{
			let arc_center = { x: undefined, y: undefined, z: undefined };

			switch(plane){
				case "XY":
					arc_center.x = center.abscissa;
					arc_center.y = center.ordinate;
					arc_center.z = start_pos.z;
				break;

				case "YZ":
					arc_center.x = start_pos.x;
					arc_center.y = center.abscissa;
					arc_center.z = center.ordinate;
				break;

				case "XZ":
					arc_center.x = center.abscissa;
					arc_center.y = start_pos.y;
					arc_center.z = center.ordinate;
				break;

			}

			return arc_center;
		}


		function add_arc_radius_format( {plane="XY", start_pos, end_pos, radius, clockwise, turns_num=1} )
		{
/*
			console.log(`[add_arc_radius_format]
\tplane: "${plane}",
\tstart_pos: (${start_pos.x}, ${start_pos.y}, ${start_pos.z}),
\tend_pos: (${end_pos.x}, ${end_pos.y}, ${end_pos.z}),
\tradius: ${radius}`);
*/
			if (start_pos === end_pos){
				console.warn(`Invalid arc coordinates`);
				return;
			}

			const at_plane = get_arc_points_at_plane(plane, start_pos, end_pos);

			// Start and End points' abscissa and ordinate
			let s = {};
			s.x = at_plane.start_point.abscissa;
			s.y = at_plane.start_point.ordinate;
			let e = {};
			e.x = at_plane.end_point.abscissa;
			e.y = at_plane.end_point.ordinate;

			// Calculate circle center's coordinates as system of two quadratic equations
			let a = e.x ** 2 - s.x ** 2 + e.y ** 2 - s.y ** 2;
			let A = 2 * s.y * (e.y - s.y) - a;
			let B = 4 * ((e.y - s.y) ** 2);
			let E = B + 4 * ((e.x - s.x) ** 2);
			let F = 4 * A * (e.x - s.x) - 2 * B * s.x;
			let G = (s.x ** 2) * B + A ** 2 - B * (radius ** 2);

			// Cx Descriminant
			let D = F ** 2 - 4 * E * G;
			let D_ = Math.sqrt(D);

			//console.log(`Cx Descriminant: ${D}, ${D_}`);

			// Quadratic equation has two solutions
			let C1 = {};	// Center point 1
			let C2 = {};	// Center point 2

			C1.abscissa = ( -F + D_) / (2 * E);
			C2.abscissa = ( -F - D_) / (2 * E);

			function get_center_ordinate(C_abscissa){
				return ( (a - 2 * (e.x - s.x) * C_abscissa) / (2 * (e.y - s.y)) );
			}

			C1.ordinate = get_center_ordinate(C1.abscissa);
			C2.ordinate = get_center_ordinate(C2.abscissa);

			//console.log(`C1: (${C1.abscissa}, ${C1.ordinate}); C2: (${C2.abscissa}, ${C2.ordinate})`);

			let C1_d1 = distance( {abscissa: s.x, ordinate: s.y}, C1 );
			let C1_d2 = distance( {abscissa: e.x, ordinate: e.y}, C2 );

			let C2_d1 = distance( {abscissa: s.x, ordinate: s.y}, C1 );
			let C2_d2 = distance( {abscissa: e.x, ordinate: e.y}, C2 );

			//console.log(`C1_d1: ${C1_d1}, C1_d2: ${C1_d2}`);
			//console.log(`C2_d1: ${C2_d1}, C2_d2: ${C2_d2}`);

			// Choose one circle from two solutions:
			// NOTE: A positive radius indicates that the arc turns through less than 180 degrees, 
			// while a negative radius indicates a turn of more than 180 degrees.
			let center = { abscissa: C2.abscissa, ordinate: C2.ordinate };
			if( (radius > 0) && is_under_line(at_plane.start_point, at_plane.end_point, C1 ) ){
				center.abscissa = C1.abscissa;
				center.ordinate = C1.ordinate;
			}
			// inverse logic for XZ plane
			if ( plane === "XZ" ){
				center = (center.abscissa === C1.abscissa) ? C2 : C1;
			}

			let arc_center = get_arc_center_at_plane(plane, start_pos, center);

			create_arc( {
				plane: plane, 
				start_pos: start_pos,
				end_pos: end_pos,
				arc_center_pos: arc_center,
				clockwise: clockwise,
				turns_num: turns_num,
			});
		}


		function add_arc(args, cw = true){
			// Get command parameters
			let arc = {
				x: args.x !== undefined ? state.scale * absolute( state.x, args.x ) : state.x,
				y: args.y !== undefined ? state.scale * absolute( state.y, args.y ) : state.y,
				z: args.z !== undefined ? state.scale * absolute( state.z, args.z ) : state.z,
				f: args.f !== undefined ? absolute( state.f, args.f ) : state.f,
				i: args.i !== undefined ? state.scale * args.i : 0.0,
				j: args.j !== undefined ? state.scale * args.j : 0.0,
				k: args.k !== undefined ? state.scale * args.k : 0.0,
				r: args.r !== undefined ? state.scale * args.r : 0.0,
				p: args.p !== undefined ? args.p : 1,
			};
			
			let arc_plane = undefined;

			//console.log("Adding CW arc:");
			//console.log(arc);
			//console.log(state);
			
			// Center Format Arcs
			if(args.r === undefined){

				// Determine arc's plane for center format
				if((args.i !== undefined) && (args.j !== undefined) && (args.k === undefined)){
					arc_plane = "XY";
				}
				else if((args.i !== undefined) && (args.k !== undefined) && (args.j === undefined)){
					arc_plane = "XZ";
				}
				else if((args.j !== undefined) && (args.k !== undefined) && (args.i === undefined)){
					arc_plane = "YZ";
				}
				// no axis or all 3
				else{
					// Use from commands G17..G19
					arc_plane = state.arc_plane;
				}

				add_arc_center_format({
					mode: state.arc_mode_inc,
					plane: arc_plane, 
					start_pos: {x: state.x, y: state.y, z: state.z},
					end_pos: {x: arc.x, y: arc.y, z: arc.z},
					center_offset: {i: arc.i, j: arc.j, k: arc.k},
					clockwise: cw,
					turns_num: arc.p,
				});
			}
			// Radius Format Arcs
			else{

				// Determine arc's plane for radius format
				if((args.x !== undefined) && (args.y !== undefined) && (args.z === undefined)){
					arc_plane = "XY";
				}
				else if((args.x !== undefined) && (args.z !== undefined) && (args.y === undefined)){
					arc_plane = "XZ";
				}
				else if((args.y !== undefined) && (args.z !== undefined) && (args.x === undefined)){
					arc_plane = "YZ";
				}
				// no axis or all 3
				else{
					// Use from commands G17..G19
					arc_plane = state.arc_plane;
				}

				add_arc_radius_format({
					plane: arc_plane, 
					start_pos: {x: state.x, y: state.y, z: state.z},
					end_pos: {x: arc.x, y: arc.y, z: arc.z},
					radius: arc.r,
					clockwise: cw,
					turns_num: arc.p,
				});
			}

			state.x = arc.x;
			state.y = arc.y;
			state.z = arc.z;
		}


		//console.log("Input:\n" + text);

		// Remove comments
		let data = text.replace( /[;\(].+/g, "" )

		// Remove line numbers
		data = data.replace( /n\d+\s/g, "" );

		// Place every G-code at the new line
		data = data.replace( /(?<=(\w.+?))(\s?g.+?)/ig, "\n$2" );

		// Split commands and arguments
		data = data.replace( /(\d)([a-z])/ig, "$1 $2");

		// Place every T-code at the new line
		//data = data.replace( /(?<=(\w.+?))(\s?t.+?)/ig, "\n$2" );

		// Split tool-change commands and their arguments
		//data = data.replace( /(t)(\d+)/ig, "$1 t$2");

		// Remove start-line spaces
		data = data.replace( /^\s/gm, "");

		// Edit line-endings
		data = data.replace( /\r/g, "\n");

		// Get array of strings from input text
		var lines = data.split( '\n' );

		// Remove empty lines
		lines = lines.filter(function (el) {
  			return el != "";
		});

		//console.log("lines:\n" + lines);

		let prev_cmd = null;
		for ( var i = 0; i < lines.length; i ++ ) 
		{
			var tokens = lines[ i ].split( ' ' );
			var cmd = tokens[ 0 ].toUpperCase();
			let args_start_idx = 1;

			// Use previuos command if current starts from coordinates
			/*cmd[0] === "X" || cmd[0] === "Y" || cmd[0] === "Z" || cmd[0] === "R" || cmd[0] === "F"*/
			if( ["X", "Y", "Z", "R", "F"].includes(cmd[0]) ) {
				if(!prev_cmd) prev_cmd = lines[ i-1 ].split( ' ' )[0].toUpperCase();
				cmd = prev_cmd;
				prev_cmd = cmd;
				args_start_idx = 0;
			}

			// Argumments
			var args = {};
			tokens.splice( args_start_idx ).forEach( function ( token ) {

				if ( token[ 0 ] !== undefined ) {

					var key = token[ 0 ].toLowerCase();
					var value = parseFloat( token.substring( 1 ) );
					args[ key ] = value;

				}

			} );

			//console.log("CMD: " + cmd + " args: ");
			//console.log(args);

			switch(cmd){

				// Rapid Move
				// Linear Move
				case "G0":
				case "G00":
				case "G1":
				case "G01":{
					let line = {
						x: args.x !== undefined ? state.scale * absolute( state.x, args.x ) : state.x,
						y: args.y !== undefined ? state.scale * absolute( state.y, args.y ) : state.y,
						z: args.z !== undefined ? state.scale * absolute( state.z, args.z ) : state.z,
						e: args.e !== undefined ? absolute( state.e, args.e ) : state.e,
						f: args.f !== undefined ? absolute( state.f, args.f ) : state.f,
					};

					//line.x = +line.x.toFixed(3);
					//line.y = +line.y.toFixed(3);
					//line.z = +line.z.toFixed(3);
					//console.log("scale: " + state.scale);
					//console.log(line);

					add_line({x: state.x, y: state.y, z: state.z}, {x: line.x, y: line.y, z: line.z});
					state.x = line.x;
					state.y = line.y;
					state.z = line.z;
					break;
				}

				/* Arc center offsets are a relative distance from the start location of the arc. 
				Incremental Arc Distance Mode is default. One or more axis words and one or more offsets 
				must be programmed for an arc that is less than 360 degrees. No axis words and one or more 
				offsets must be programmed for full circles. The P word defaults to 1 and is optional.
				*/
				// Arc Move (clockwise)
				case "G2":
				case "G02":

					add_arc(args, true);
					break;

				// Arc Move (counterclockwise)
				case "G3":
				case "G03":
					//console.warn("Adding CCW arc not supported");

					add_arc(args, false);
					break;

				// Plane Select - XY (default)
				case "G17":
					state.arc_plane = "XY";
					break;

				// Plane Select - ZX
				case "G18":
					state.arc_plane = "XZ";
					break;

				// Plane Select - YZ
				case "G19":
					state.arc_plane = "YZ";
					break;

				// Units 'inch'
				case "G20":
					state.scale = 25.4;
					break;

				// Units 'mm'
				case "G21":
					state.scale = 1.0;
					break;


				// Turn cutter compensation off. If tool compensation was on the next move 
				// must be a linear move and longer than the tool diameter
				case "G40":
					break;

				// Path Blending
				case "G64":
					break;

				// Absolute distance mode In absolute distance mode
				case "G90":
					state.relative = false;
					break;

				// Incremental distance mode, represent increments from the current coordinate.
				case "G91":
					state.relative = true;
					break;

				// Arc Absolute Distance Mode
				case "G90.1":
					console.log('Setting Arc Absolute Distance Mode');
					state.arc_mode_inc = false;
					break;

				// Arc Incremental Distance Mode (default)
				case "G91.1":
					console.log('Setting Arc Incremental Distance Mode');
					state.arc_mode_inc = true;
					break;


				// Select Tool (prepare to change to tool x)
				case "T":
					console.log(`Tool-change preparation at line ${i+1}`);
					break;

				default:
					console.warn( 'NGCodeLoader: Command not supported:' + cmd );
			}
		}

		ngc_object.frustumCulled = false;
		ngc_object.flipSided = false; 
		ngc_object.doubleSided = true;
		//ngc_object.geometry.computeBoundingSphere();

		return create_gcode_object();
	}

}

export { NGCodeLoader };
