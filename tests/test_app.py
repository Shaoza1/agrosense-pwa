import unittest
from app import create_app

class BasicTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app().test_client()
        self.app.testing = True

    def test_index(self):
        response = self.app.get('/')
        self.assertEqual(response.status_code, 200)
        # Check that some known string (from the attached document, e.g., "AgroSense") is in the response.
        self.assertIn(b'AgroSense', response.data)

if __name__ == '__main__':
    unittest.main()
