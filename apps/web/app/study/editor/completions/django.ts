import { calledName } from "./catalog-helpers.ts";
import type { CatalogItem } from "./types.ts";

function djangoModelMember(insertText: string): CatalogItem {
  const label = calledName(insertText);

  return {
    label,
    insertText,
    documentation: "Django model field or schema option.",
    framework: "django",
    context: "member",
    receiver: "django.models",
    kind: "Class",
  };
}

export const djangoCatalog: CatalogItem[] = [
  {
    label: "django-model",
    insertText: `class \${1:Item}(models.Model):
    \${2:name} = models.CharField(max_length=\${3:200})

    class Meta:
        ordering = ["\${2:name}"]

    def __str__(self):
        return self.\${2:name}`,
    documentation: "Django model with metadata.",
    framework: "django",
    imports: ["from django.db import models"],
  },
  {
    label: "django-meta",
    insertText: `class Meta:
    ordering = ["\${1:name}"]
    verbose_name_plural = "\${2:items}"`,
    documentation: "Model metadata.",
    framework: "django",
  },
  {
    label: "django-view",
    insertText: `def \${1:index}(request):
    return render(request, "\${2:items/index.html}", {"\${3:items}": \${4:items}})`,
    documentation: "Function-based view.",
    framework: "django",
    imports: ["from django.shortcuts import render"],
  },
  {
    label: "django-list-view",
    insertText: `class \${1:ItemListView}(ListView):
    model = \${2:Item}
    template_name = "\${3:items/list.html}"`,
    documentation: "Class-based list view.",
    framework: "django",
    imports: ["from django.views.generic import ListView"],
  },
  {
    label: "django-url",
    insertText: 'path("${1:items/}", ${2:views.index}, name="${3:item-list}")',
    documentation: "URL route.",
    framework: "django",
    imports: ["from django.urls import path"],
  },
  {
    label: "django-include",
    insertText: 'path("${1:api/}", include("${2:items.urls}"))',
    documentation: "Include application URLs.",
    framework: "django",
    imports: ["from django.urls import path, include"],
  },
  {
    label: "django-admin",
    insertText: `@admin.register(\${1:Item})
class \${1:Item}Admin(admin.ModelAdmin):
    list_display = ["\${2:id}", "\${3:name}"]`,
    documentation: "Register a model in Django admin.",
    framework: "django",
    imports: ["from django.contrib import admin"],
  },
  {
    label: "django-form",
    insertText: `class \${1:ItemForm}(forms.ModelForm):
    class Meta:
        model = \${2:Item}
        fields = ["\${3:name}"]`,
    documentation: "Model-backed form.",
    framework: "django",
    imports: ["from django import forms"],
  },
  {
    label: "drf-serializer",
    insertText: `class \${1:ItemSerializer}(serializers.ModelSerializer):
    class Meta:
        model = \${2:Item}
        fields = ["id", "\${3:name}"]`,
    documentation: "DRF model serializer.",
    framework: "drf",
    imports: ["from rest_framework import serializers"],
  },
  {
    label: "drf-viewset",
    insertText: `class \${1:ItemViewSet}(viewsets.ModelViewSet):
    queryset = \${2:Item}.objects.all()
    serializer_class = \${3:ItemSerializer}`,
    documentation: "DRF model viewset.",
    framework: "drf",
    imports: ["from rest_framework import viewsets"],
  },
  {
    label: "drf-router",
    insertText: `router = DefaultRouter()
router.register("\${1:items}", \${2:ItemViewSet})
urlpatterns = router.urls`,
    documentation: "DRF router.",
    framework: "drf",
    imports: ["from rest_framework.routers import DefaultRouter"],
  },
  djangoModelMember("CharField(max_length=${1:200})"),
  djangoModelMember("TextField(blank=True)"),
  djangoModelMember("IntegerField(default=${1:0})"),
  djangoModelMember("BigAutoField(primary_key=True)"),
  djangoModelMember("BooleanField(default=False)"),
  djangoModelMember("DateTimeField(auto_now_add=True)"),
  djangoModelMember("DateField(null=True, blank=True)"),
  djangoModelMember("EmailField(unique=True)"),
  djangoModelMember("UUIDField(default=uuid.uuid4, editable=False)"),
  djangoModelMember("ForeignKey(${1:Parent}, on_delete=models.CASCADE)"),
  djangoModelMember("ManyToManyField(${1:Tag}, blank=True)"),
  djangoModelMember("OneToOneField(${1:Profile}, on_delete=models.CASCADE)"),
  djangoModelMember("DecimalField(max_digits=${1:10}, decimal_places=${2:2})"),
  djangoModelMember("JSONField(default=dict)"),
  djangoModelMember("SlugField(unique=True)"),
  djangoModelMember('Index(fields=["${1:name}"])'),
  djangoModelMember(
    'UniqueConstraint(fields=["${1:name}"], name="${2:unique_name}")',
  ),
];
