/*
 * View model for BLV Logger
 *
 * Author: jneilliii
 * License: MIT
 */
$(function() {
    function BlvloggerViewModel(parameters) {
        var self = this;

        self.settingsViewModel = parameters[0];
        self.bedlevelvisualizerViewModel = parameters[1];
        self.controlViewModel = parameters[2];

        self.timestamps = ko.observableArray([]);
        self.mesh_data = ko.observableArray([]);
        self.start_time = ko.observable(new moment().format('YYYY-MM-DD'));
        self.end_time = ko.observable(new moment().format('YYYY-MM-DD'));
        self.current_mesh_data = ko.observable();
        self.current_mesh_index = ko.observable();
        self.id = ko.observable();
        self.mesh_id_in_eeprom = ko.observable();
        self.mesh_gcode_in_eeprom = ko.observable();

        //se ejecuta al iniciar la pagina, y tambien al tocar el <select> (lo ejecuta self.graph_data)
        self.selected_mesh = ko.computed(function() {
            console.log("self.selected_mesh")
            var search = self.current_mesh_data();
            if (!search) {
                return null;
            } else {
                return ko.utils.arrayFirst(self.mesh_data(), function(item) {
                    self.id(item[3]);
                    self.current_mesh_index(self.mesh_data().indexOf(item));
                    return item[0] === search;//timestamp  //arrayFirst=expects a function that returns true or false, evaluating each item. The first item for which the function returns true is returned.
                });
            }
        });

        self.available_ids = ko.computed(function() {
            let available_ids_array = [];
            ko.utils.arrayForEach(self.mesh_data(), function (item) { available_ids_array.push(item[3]); });
            return available_ids_array;
        });

        self.onDataUpdaterPluginMessage = function (plugin, mesh_data) {
            if (plugin !== "blvlogger") { return; }
            self.mesh_data(mesh_data["mesh"]);

            self.mesh_id_in_eeprom(self.settingsViewModel.settings.plugins.blvlogger.last_mesh_id_saved_in_eeprom());
            self.mesh_gcode_in_eeprom(self.settingsViewModel.settings.plugins.blvlogger.last_mesh_gcode_saved_in_eeprom());

            //Seleccionamos el <option id> == al de la EEPROM
            ko.utils.arrayForEach(self.mesh_data(), function (item) {
                if (item[3] == self.mesh_id_in_eeprom()) {
                    if($('option[id="'+self.mesh_id_in_eeprom()+'"]')){
                        self.id(item[3]);
                        $('option[id="'+self.mesh_id_in_eeprom()+'"]').attr('selected', 'selected')
                        $('input[id="inputShowID"]').val(self.mesh_id_in_eeprom())
                    }
                }
            });
        }

        self.graph_data = function(obj, event){//este se ejecuta cuando eliges un <option> dentro del <select>
            if (event.originalEvent) {
                //user changed
                self.bedlevelvisualizerViewModel.onDataUpdaterPluginMessage("bedlevelvisualizer", {mesh: JSON.parse(self.selected_mesh()[1]), bed: JSON.parse(self.selected_mesh()[2])})
            }
        }

        self.update_time_frame = function(obj, event){
            if (event.originalEvent) {
                //user changed
                $.ajax({
                    url: API_BASEURL + "plugin/blvlogger",
                    type: "GET",
                    dataType: "json",
                    data: {start:self.start_time(), end: self.end_time()},
                    contentType: "application/json; charset=UTF-8"
                }).done(function(data){
                    if(data.start && data.end){
                        console.log('success');
                    }
				});
            }
        }

        //https://docs.octoprint.org/en/master/plugins/viewmodels.html
        self.onBeforeBinding = function(){
            $('#bedlevelvisualizergraph').next('div').replaceWith($('#blvlogger'));

                $('#bedlevelvisualizerbutton > button:first').after($('#deleteMeshFromDB'));
            $('#bedlevelvisualizerbutton > button:first').after($('#saveInEEPROM'));

            $('#bedlevelvisualizerbutton').after($('#config_file_mesh_info'));
        }

        self.updateMeshEEPROM = function(){
            let mesh_data = JSON.parse(self.selected_mesh()[1]);

            let gcode_cmds = ['G29 L0','G29 I999'] //'G29 L0'; slot 0. Cargamos y seleccionamos este slot para los siguientes M421

            let count = 0;
            for (let i = 0; i < mesh_data.length; i++) {
                for (let j = 0; j < mesh_data.length; j++) {
                    mesh_data[j][i] = mesh_data[j][i].toString().replace('+','');//+ symbol not needed in Gcode for positive values, only - is needed for negative ones
                    gcode_cmds.push(`M421 I${i} J${j} Z${mesh_data[j][i]}`);
                    count++;
                }
            }
            //force mesh graph refresh, with last mesh in eeprom: (commented because graph refresh creates a new entry in DB)
            //gcode_cmds.push('@BEDLEVELVISUALIZER','M420 S1 V');
            gcode_cmds.push('G29 F 10.0 ; Set Fade Height for correction at 10.0 mm.', 'G29 A ; Activate the UBL System.', 'M500 ; save the current setup to EEPROM');

            // clean extraneous code
            gcode_cmds = gcode_cmds.filter(function(array_val) { return Boolean(array_val) === true; });

            self.settingsViewModel.settings.plugins.bedlevelvisualizer.stored_mesh(mesh_data);
            self.settingsViewModel.settings.plugins.blvlogger.last_mesh_id_saved_in_eeprom(self.id());
            self.settingsViewModel.settings.plugins.blvlogger.last_mesh_gcode_saved_in_eeprom(mesh_data);
            self.settingsViewModel.saveData();

            self.mesh_id_in_eeprom(self.id())
            self.mesh_gcode_in_eeprom(mesh_data);

            new PNotify({title: 'Mesh saved in EEPROM',text: '<div class="row-fluid">You can manually check if the MESH is valid, with one of the following gcodes:<br>G29 S-1<br>G29 T<br>M420 S1 V</div>', type: 'info', hide: false});

            OctoPrint.control.sendGcode(gcode_cmds);
            //return gcode_cmds;
        }


        self.deleteRowByID = function() {
            alert(self.id());

            $.ajax({
                url: API_BASEURL + "plugin/blvlogger",
                type: "GET",
                dataType: "json",
                data: {remove_history_data_by_id: self.id()},
                contentType: "application/json; charset=UTF-8"
            }).done(function(data){
                if(data.deleted_rows){
                    self.mesh_data.splice(self.current_mesh_index(), 1);
                    new PNotify({title: 'Removed',text: '<div class="row-fluid">Mesh removed from DB</div>', type: 'info', hide: false});
                }
                });
        };

        self.generateTxtAndDownload = function() {
            var text_string = "probando";
            text_string = self.mesh_gcode_in_eeprom();

            let mesh_data = text_string;

            header = '; MESH ID #' + self.mesh_id_in_eeprom()
            let gcode_cmds = [header, 'G29 L0; (OPTIONAL). this places us in slot 0. We load and select this slot for the following gcodes','G29 I999'] //'G29 L0'; slot 0. We load and select this slot for the following M421

            let count = 0;
            for (let i = 0; i < mesh_data.length; i++) {
                for (let j = 0; j < mesh_data.length; j++) {
                    mesh_data[j][i] = mesh_data[j][i].toString().replace('+','');//+ symbol not needed in Gcode for positive values, only - is needed for negative ones
                    gcode_cmds.push(`M421 I${i} J${j} Z${mesh_data[j][i]}`);
                    count++;
                }
            }

            gcode_cmds.push('G29 F 10.0 ; Set Fade Height for correction at 10.0 mm.', 'G29 A ; Activate the UBL System.', 'M500 ; save the current setup to EEPROM');

            let finalString  = gcode_cmds.join('\r\n');

            var link = document.createElement('a');
            link.download = 'Mesh.txt';
            var blob = new Blob([finalString], {type: 'text/plain'});
            link.href = window.URL.createObjectURL(blob);
            link.click();
        }

    }


    OCTOPRINT_VIEWMODELS.push({
        construct: BlvloggerViewModel,
        dependencies: [ "settingsViewModel", "bedlevelvisualizerViewModel", "controlViewModel" ],
        elements: [ "#blvlogger", "#saveInEEPROM", "#deleteMeshFromDB", "#config_file_mesh_info" ]
    });
});
