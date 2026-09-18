from rest_framework import serializers

from .models import Productos


class ProductoSerializer(serializers.ModelSerializer):
    categoria_nombre = serializers.CharField(source="categoria.nombre", read_only=True)

    class Meta:
        model = Productos
        fields = ("id", "nombre", "precio", "imagen", "disponible", "categoria", "categoria_nombre")
        read_only_fields = fields
