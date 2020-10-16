# -*- coding: utf-8 -*-
from __future__ import absolute_import

import json
import os
import sqlite3
from datetime import datetime

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

    def get_settings_defaults(self):
        return {}

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

    ##~~ Utility Functions

    def send_history_data(self):
        if self.db_path is not None:
            db = sqlite3.connect(self.db_path)
            cursor = db.cursor()
            cursor.execute(
                """SELECT timestamp, mesh, bed FROM mesh_history_data ORDER BY timestamp DESC"""
            )
            mesh_history_data = {"mesh": cursor.fetchall()}
            self._plugin_manager.send_plugin_message(self._identifier, mesh_history_data)

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
