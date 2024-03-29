# -*- coding: utf-8 -*-
from __future__ import absolute_import

import json
import os
import sqlite3
from datetime import datetime, timedelta

import flask
import octoprint.plugin


class BlvloggerPlugin(
    octoprint.plugin.SettingsPlugin,
    octoprint.plugin.AssetPlugin,
    octoprint.plugin.TemplatePlugin,
    octoprint.plugin.EventHandlerPlugin,
    octoprint.plugin.SimpleApiPlugin,
    octoprint.plugin.StartupPlugin,
):
    def __init__(self):
        self.db_path = None

    ##~~ StartupPlugin mixin

    def on_startup(self, host, port):
        self.db_path = os.path.join(
            self.get_plugin_data_folder(), "bedlevelvisualizer.db"
        )
        if not os.path.exists(self.db_path):
            db = sqlite3.connect(self.db_path)
            cursor = db.cursor()
            cursor.execute(
                """CREATE TABLE mesh_history_data(id INTEGER PRIMARY KEY, timestamp TEXT, mesh TEXT, bed TEXT)"""
            )
            db.commit()
            db.close()

    ##~~ SettingsPlugin mixin
    #       https://docs.octoprint.org/en/master/plugins/mixins.html

    def get_settings_defaults(self):
        return { 'last_mesh_id_saved_in_eeprom': None, 'last_mesh_gcode_saved_in_eeprom': None }

    ##~~ AssetPlugin mixin

    def get_assets(self):
        return {
            "js": ["js/blvlogger.js"],
        }

    ##~~ EventHandlerPlugin mixin

    def on_event(self, event, payload):
        if event == "plugin_bedlevelvisualizer_mesh_data_collected":
            if payload.get("mesh", False) and self.db_path is not None:
                today = datetime.today()
                mesh_data = payload["mesh"]
                bed_data = payload["bed"]
                db = sqlite3.connect(self.db_path)
                cursor = db.cursor()
                cursor.execute(
                    """INSERT INTO mesh_history_data(timestamp, mesh, bed) VALUES(?,?,?)""",
                    [today.isoformat(" "), json.dumps(mesh_data), json.dumps(bed_data)],
                )
                db.commit()
                db.close()
                self.send_history_data()
        if event == "ClientOpened":
            self.send_history_data()

    ##~~ SimpleApiPlugin mixin

    def get_api_commands(self):
        return dict(stopProcessing=[])

    def on_api_get(self, request):
        if request.args.get("start") and request.args.get("end"):
            self.send_history_data(
                start=request.args.get("start"), end=request.args.get("end")
            )
            return flask.jsonify(
                start=request.args.get("start"), end=request.args.get("end")
            )
        elif request.args.get("remove_history_data_by_id"):
            _id = request.args.get("remove_history_data_by_id")
            result = self.remove_history_data(_id)
            return flask.jsonify(result)
        else:
            return flask.make_response("There was an error", 200)

    ##~~ Utility Functions

    def send_history_data(self, start=None, end=None):
        if self.db_path is not None:
            if start is None:
                start = datetime.today().date() - timedelta(days=1)
            if end is None:
                end = datetime.today().date() + timedelta(days=1)
            db = sqlite3.connect(self.db_path)
            cursor = db.cursor()
            cursor.execute(
                """SELECT timestamp, mesh, bed, id FROM mesh_history_data WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp DESC""",
                [start, end],
            )
            mesh_history_data = {"mesh": cursor.fetchall()}
            self._plugin_manager.send_plugin_message(self._identifier, mesh_history_data)

    def remove_history_data(self, _id):
        if self.db_path is not None and _id is not None:
            db = sqlite3.connect(self.db_path)
            cursor = db.cursor()
            cursor.execute(
                """DELETE FROM mesh_history_data WHERE id=?""",
                [_id],
            )
            #return_data = {"blvlogger_deleted": cursor.fetchall()}
            #self._plugin_manager.send_plugin_message(self._identifier, mesh_history_data)
            try:
                db.commit()
                if cursor.rowcount:
                    return {'deleted_rows': cursor.rowcount}
            except Exception:
                return False


    ##~~ Softwareupdate hook

    def get_update_information(self):
        return {
            "blvlogger": {
                "displayName": "BLV Logger",
                "displayVersion": self._plugin_version,
                # version check: github repository
                "type": "github_release",
                "user": "jneilliii",
                "repo": "OctoPrint-BLVLogger",
                "current": self._plugin_version,
                "stable_branch": {
                    "name": "Stable",
                    "branch": "master",
                    "comittish": ["master"],
                },
                "prerelease_branches": [
                    {
                        "name": "Release Candidate",
                        "branch": "rc",
                        "comittish": ["rc", "master"],
                    }
                ],
                # update method: pip
                "pip": "https://github.com/jneilliii/OctoPrint-BLVLogger/archive/{target_version}.zip",
            }
        }


__plugin_name__ = "BLV Logger"
__plugin_pythoncompat__ = ">=2.7,<4"  # python 2 and 3


def __plugin_load__():
    global __plugin_implementation__
    __plugin_implementation__ = BlvloggerPlugin()

    global __plugin_hooks__
    __plugin_hooks__ = {
        "octoprint.plugin.softwareupdate.check_config": __plugin_implementation__.get_update_information
    }
