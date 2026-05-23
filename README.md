# Edward

Edward es una app hecha con React y Vite para **extraer y separar imágenes** desde distintos tipos de archivos en el navegador.

## ¿Qué hace?

La aplicación permite trabajar con tres tipos de entrada:

- **Imágenes** (`jpg`, `jpeg`, `png`, `webp`, `gif`, `bmp`, `svg`): intenta detectar y separar regiones visuales dentro de una sola imagen.
- **Documentos Office** (`docx`, `pptx`, `xlsx`): extrae las imágenes embebidas dentro del archivo.
- **PDF**: renderiza cada página como una imagen exportable.

Cada resultado se muestra en tarjetas individuales y puede descargarse por separado o exportarse todo en un `.zip`.

## ¿Para qué sirve?

Sirve para revisar archivos que contienen varias imágenes o elementos visuales y obtener cada parte por separado sin salir del navegador.  
Está pensado como una herramienta rápida para inspección visual, extracción básica y exportación de recursos.

## Cómo usarla

1. Abre la aplicación.
2. Selecciona un archivo desde la barra lateral.
3. Espera a que Edward procese el contenido.
4. Revisa la vista previa y las imágenes separadas.
5. Descarga cada imagen individualmente o exporta todo en ZIP.

## Requisitos

- Node.js instalado en tu computadora.
- npm disponible en la terminal.

## Instalación

```bash
npm install
```

## Ejecutar en desarrollo

```bash
npm run dev
```

Luego abre la dirección que te muestra Vite en tu navegador.

## Generar versión de producción

```bash
npm run build
```

## Vista previa de producción

```bash
npm run preview
```

## Estructura general

- `src/App.jsx`: lógica principal de la interfaz.
- `src/components/`: componentes pequeños y reutilizables.
- `src/styles.css`: estilos globales.
- `vite.config.js`: configuración de Vite.

## Notas

- La separación de imágenes funciona mejor cuando hay buen contraste entre elementos y fondo.
- En PDF, el resultado actual es una imagen por página renderizada.
- En archivos Office, la extracción se hace desde las imágenes embebidas del documento.