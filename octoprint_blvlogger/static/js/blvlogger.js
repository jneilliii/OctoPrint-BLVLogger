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
        self.timestamps = ko.observableArray([]);
        self.mesh_data = ko.observableArray([]);
        self.current_mesh_data = ko.observable();
        self.selected_mesh = ko.computed(function() {
            var search = self.current_mesh_data();
            if (!search) {
                return null;
            } else {
                return ko.utils.arrayFirst(self.mesh_data(), function(item) {
                    return item[0] === search;
                });
            }
        });

        self.onDataUpdaterPluginMessage = function (plugin, mesh_data) {
            if (plugin !== "blvlogger") {
				return;
			}
            self.mesh_data(mesh_data["mesh"]);
        }

        self.graph_data = function(obj, event){
            if (event.originalEvent) {
                //user changed
                self.bedlevelvisualizerViewModel.onDataUpdaterPluginMessage("bedlevelvisualizer", {mesh: JSON.parse(self.selected_mesh()[1]), bed: JSON.parse(self.selected_mesh()[2])})
            } else {
                // program changed
            }
        }

        self.onBeforeBinding = function(){
            $('#bedlevelvisualizergraph').next('div').replaceWith($('#blvlogger'));
        }
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: BlvloggerViewModel,
        dependencies: [ "settingsViewModel", "bedlevelvisualizerViewModel" ],
        elements: [ "#blvlogger" ]
    });
});
