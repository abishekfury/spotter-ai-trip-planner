"""Request validation for the public API."""

from datetime import datetime, timezone

from rest_framework import serializers


class PointSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lng = serializers.FloatField(min_value=-180, max_value=180)
    name = serializers.CharField(required=False, allow_blank=True, default="")


class RouteRequestSerializer(serializers.Serializer):
    origin = PointSerializer()
    destination = PointSerializer()
    departure_time = serializers.DateTimeField(required=False)
    load_weight = serializers.FloatField(min_value=0, max_value=200_000, default=35_000)
    sample_interval_miles = serializers.ChoiceField(choices=[10, 25, 50], default=25)

    def validate(self, attrs):
        o, d = attrs["origin"], attrs["destination"]
        if abs(o["lat"] - d["lat"]) < 1e-3 and abs(o["lng"] - d["lng"]) < 1e-3:
            raise serializers.ValidationError("Origin and destination must differ.")
        departure = attrs.get("departure_time") or datetime.now(timezone.utc)
        if departure.tzinfo is None:
            departure = departure.replace(tzinfo=timezone.utc)
        attrs["departure_time"] = departure
        attrs["sample_interval_miles"] = float(attrs["sample_interval_miles"])
        return attrs
