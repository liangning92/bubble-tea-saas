#!/usr/bin/env python3
"""Compatibility entry for the scoped notification/device PG contract suite."""
import pathlib
import runpy
runpy.run_path(str(pathlib.Path(__file__).with_name('test-notification-awareness.py')), run_name='__main__')
