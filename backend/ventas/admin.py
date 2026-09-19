from django.contrib import admin

from .models import Categorias, Productos


@admin.register(Categorias)
class CategoriasAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'activa')
    list_filter = ('activa',)
    search_fields = ('nombre',)


@admin.register(Productos)
class ProductosAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'categoria', 'precio', 'disponible', 'activo')
    list_filter = ('categoria', 'disponible', 'activo')
    search_fields = ('nombre',)
