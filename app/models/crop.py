from app import db
from datetime import date

class Crop(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(64), nullable=False, index=True)
    planted_date = db.Column(db.Date, default=date.today, nullable=False)
    health_status = db.Column(db.String(64), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))

    def __repr__(self):
        return f"<Crop {self.name}>"
