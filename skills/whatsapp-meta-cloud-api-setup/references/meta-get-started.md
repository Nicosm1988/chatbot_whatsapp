# Get Started with WhatsApp Business Platform

*(Documentación basada en: https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)*

La API en la nube (Cloud API) alojada por Meta te permite implementar las API de WhatsApp Business sin los gastos que supone hospedar tus propios servidores, además de que te permite escalar los mensajes de tu empresa con mayor facilidad. 

Para enviar y recibir mensajes, necesitas:
1.  **Registrarte como desarrollador** en Meta.
2.  **Activar la cuenta** de desarrollador.
3.  **Crear una aplicación** de tipo "Business".
4.  **Añadir el producto WhatsApp** a tu aplicación.
5.  **Enviar mensajes de prueba** usando el número de teléfono de prueba que Meta provee gratuitamente.

## Componentes Clave

*   **Identificador del número de teléfono:** Un ID numérico único asociado al número de teléfono desde el que enviarás mensajes.
*   **Identificador de la cuenta de WhatsApp Business (WABA):** Un ID numérico único asociado a tu cuenta de empresa.
*   **Token de acceso:** Un token que se incluye en los encabezados HTTP (Authorization: Bearer <token>) para autenticar tus peticiones a la Graph API de Meta.

Para realizar integraciones a nivel de producción (usar un número real propio), es necesario completar la **Verificación de la empresa** en el Administrador comercial de Meta.
