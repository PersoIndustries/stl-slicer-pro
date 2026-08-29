# STL Slicer Pro

Crea una aplicación web completa y 100% client-side (que funcione solo en el navegador, sin backend ni servidor) para cortar modelos 3D STL directamente en el navegador.

**Requisitos técnicos importantes:**

- Todo debe procesarse localmente en el navegador del usuario (client-side only).

- No usar ningún servicio externo, API ni backend. Todo el corte, cierre de malla y exportación debe hacerse con JavaScript y librerías client-side.

- Usar Three.js y librerías compatibles con navegador (como three-bvh-csg o similares que funcionen en cliente).

**Características principales:**

- Subir archivo STL mediante arrastrar y soltar o botón grande (procesado localmente).

- Visualizador 3D potente con Three.js que permita rotar, zoom y pan con el ratón fácilmente.

**Usabilidad avanzada para situar el plano:**

- Mostrar un plano visual transparente con grid y bordes resaltados.

- Controles tipo gizmo (flechas y discos de rotación) para mover y rotar el plano en los 3 ejes.

- Botones de alineación rápida:

  - Centrar en el modelo

  - Alinear a ejes X, Y, Z

  - Alinear a caras (Superior, Inferior, Frontal, Trasera, Izquierda, Derecha)

- Sliders y campos numéricos para ajustar posición (X, Y, Z) y rotación con precisión.

- Previsualización en tiempo real del corte mientras se mueve el plano.

**Después del corte:**

- Cerrar automáticamente la malla creando una tapa plana y sólida (watertight / manifold) para que la pieza quede lista para impresión 3D.

- Opción para dividir en dos piezas o mantener solo una parte.

- Opción para añadir pines o dovelas automáticas en la cara del corte.

- Botón de reparar malla.

**Otras funciones:**

- Descargar cada pieza como archivo STL.

- Modo wireframe y vista de secciones.

- Undo / Redo.

- Indicador de progreso durante el procesamiento (porque puede ser pesado).

**Interfaz:**

- Diseño moderno oscuro y limpio.

- Sidebar izquierdo con herramientas.

- Canvas 3D grande en el centro.

- Panel derecho con controles detallados del plano.

- Muy intuitivo, con tooltips y guías para principiantes.

Haz que la aplicación sea responsive y optimizada para buen rendimiento en navegadores modernos.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b0bf7f71-caff-443f-a97e-39d35fe14cf1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
