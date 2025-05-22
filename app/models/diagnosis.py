from app import db
from datetime import datetime, timezone

class Diagnosis(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    crop_id = db.Column(db.Integer, db.ForeignKey('crop.id'))
    result = db.Column(db.String(256))
    severity = db.Column(db.Integer)  # Example: percentage or scale value
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    def __repr__(self):
        return f'<Diagnosis {self.result}>'
