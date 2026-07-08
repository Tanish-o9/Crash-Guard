"""pytest conftest for ML service tests"""
import sys
import os

# Allow importing from the ml service root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
