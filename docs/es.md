# CardDAV Birthdays

Los cumpleaños de sus contactos, en el calendario de Gladys. Conecte la libreta de direcciones
CardDAV con la que su teléfono ya se sincroniza (Nextcloud, iCloud, Radicale, Baïkal…): cada contacto
con fecha de nacimiento se convierte en un evento anual, «Cumpleaños de Marie Martin (34 años)», que
se mantiene al día según cambian sus contactos. Los aniversarios de boda pueden ir en un segundo
calendario.

Probada con un servidor Radicale real. Nextcloud, iCloud y Baïkal siguen el mismo estándar pero no se
han probado con una cuenta real: sus comentarios son bienvenidos.

## Lo que obtiene

- **Un calendario «Cumpleaños» por usuario**, con un año de antelación y un evento de día completo
  por cumpleaños, con la edad cuando se conoce el año de nacimiento. Aparece en la vista de
  calendario de Gladys como cualquier otro calendario.
- **Un calendario «Aniversarios de boda»**, si lo pide, a partir de la fecha `ANNIVERSARY` de los
  contactos.
- **Un disparador de escena** cada mañana a la hora elegida: un cumpleaños hoy, mañana o dentro de
  2, 3, 7, 14 o 30 días, con una frase preparada para enviar o hacer decir.
- **Una acción de escena** que da el próximo cumpleaños: quién, dentro de cuántos días, qué edad, y
  los cumpleaños del día.
- **Un widget del panel** con los próximos cumpleaños.
- Como son calendarios normales, las escenas integradas de Gladys también funcionan: «se acerca un
  evento».

## Conectar su libreta de direcciones

Cada usuario conecta su propia libreta: abra **Integraciones → CardDAV Birthdays**, luego el bloque
**Mis calendarios**, rellene los campos y pulse **Activar**.

- **Dirección del servidor CardDAV**: la dirección del servidor (la integración encuentra sola las
  libretas), o la dirección de una libreta concreta.
- **Usuario** y **Contraseña o contraseña de aplicación**: use una contraseña de aplicación siempre
  que el servicio la ofrezca. Gladys guarda la contraseña y nunca se escribe en los registros.
- **Libretas de direcciones**: nombres de las libretas que leer, separados por comas. Vacío: todas.
- **Añadir también los aniversarios de boda**: un segundo calendario con las fechas `ANNIVERSARY`.
- **Mostrar la edad en el nombre de los eventos**: «Cumpleaños de Marie Martin (34 años)», o solo
  «Cumpleaños de Marie Martin».

Después **comparta** el calendario (interruptor del mismo bloque): solo los calendarios compartidos
llegan al panel, a las escenas y a los demás miembros del hogar.

### Nextcloud

Dirección `https://cloud.example.com/remote.php/dav`, su usuario y una contraseña de aplicación
creada en **Configuración → Seguridad → Dispositivos y sesiones**.

### iCloud

Dirección `https://contacts.icloud.com`, el correo de su ID de Apple y una contraseña específica de
app creada en appleid.apple.com (**Inicio de sesión y seguridad → Contraseñas específicas de app**).
Su contraseña habitual se rechaza.

### Radicale, Baïkal y otros servidores

La dirección del servidor, por ejemplo `http://192.168.1.10:5232/` para Radicale o
`https://dav.example.com/dav.php` para Baïkal. Se admiten la autenticación Basic y la Digest.

### Contactos de Google

No compatible: el CardDAV de Google solo acepta el inicio de sesión OAuth, que las integraciones de
calendario de Gladys todavía no ofrecen. Sus contactos de Google pueden llegar a través de otro
servidor que los sincronice.

## Ajustes del administrador

- **Leer las libretas de direcciones**: cada hora, cada 6 horas (por defecto) o una vez al día. Solo
  se descarga lo que ha cambiado; un cambio de cuenta se lee al momento.
- **Hora de los recordatorios de escena**: cuándo se activa cada día el disparador «Recordatorio de
  cumpleaños» (08:00 por defecto).
- **Idioma de los textos de las escenas**: las frases y fechas que se pasan a las escenas. Los
  calendarios siguen el idioma de su propietario, el widget el de la persona que lo mira.

## En Gladys

Los eventos son de día completo, desde una semana atrás hasta un año por delante; la ventana avanza
cada noche. Un cumpleaños del 29 de febrero se celebra el 28 de febrero en los años no bisiestos. Un
año de nacimiento ausente, o escrito por convención (1604 de Apple, 0000, 1900), da un evento sin la
edad.

## Widget del panel

Añada el widget **Cumpleaños** a un panel: los próximos cumpleaños de los calendarios compartidos,
los del día marcados «Hoy». Ajustes: cuántos (3, 5 u 8), mostrar o no los aniversarios de boda,
mostrar o no la edad.

## Disparador de escena

**Recordatorio de cumpleaños**: cada día a la hora elegida, una vez por cumpleaños de un calendario
compartido.

- **Cuándo**: el mismo día, o 1, 2, 3, 7, 14 o 30 días antes.
- **Tipo**: cumpleaños, aniversarios de boda o ambos.
- **Contacto**: el nombre exacto de un contacto, o vacío para cualquiera.

Variables: el nombre, una frase preparada («Cumpleaños de Marie Martin (34 años): Mañana, lunes, 16
de noviembre.»), los días restantes, la edad, la fecha, el tipo y el propietario de la libreta.

## Acción de escena

**Consultar el próximo cumpleaños** (tipo opcional): encontrado (1 o 0), nombre, tipo, días
restantes, fecha, una frase preparada, la edad (0 si se desconoce), el número de cumpleaños de hoy y
sus nombres.

## Ejemplos de escenas

- Cada mañana a las 08:00, «Recordatorio de cumpleaños» el mismo día → enviar la frase por Telegram.
- «Recordatorio de cumpleaños» 7 días antes, tipo «cumpleaños» → «Pensar en el regalo de {{name}}».
- Al llegar a casa, «Consultar el próximo cumpleaños», y si «cumpleaños de hoy» es mayor que 0 →
  que el altavoz diga los nombres.

## Solución de problemas

- **El calendario está vacío**: su descripción en **Mis calendarios** indica por qué falló la última
  lectura (contraseña rechazada, servidor que no responde, ninguna libreta con ese nombre).
- **Usuario o contraseña rechazados**: iCloud y Nextcloud con verificación en dos pasos necesitan una
  contraseña de aplicación.
- **Nada en el widget ni en las escenas**: comparta el calendario en **Mis calendarios**.
- **Registros**: Integraciones → CardDAV Birthdays → Registros; `LOG_LEVEL=debug` para el detalle de
  cada lectura.

## Límites

- Solo lectura: nunca se escribe nada en su libreta de direcciones.
- Una cuenta CardDAV por usuario; se pueden leer varias libretas de esa cuenta.
- Los contactos se leen como mucho cada hora: un cumpleaños añadido en el teléfono aparece en la
  siguiente lectura.
- Los contactos de Google no son compatibles (ver arriba).
- Probada solo con Radicale. Nextcloud, iCloud y Baïkal: comentarios bienvenidos.

## Privacidad

Solo se leen y se guardan, en memoria, el nombre visible y las fechas de un contacto; los teléfonos,
direcciones, correos y notas nunca salen de la integración. Los calendarios siguen siendo privados
hasta que su propietario los comparte. Gladys guarda la dirección del servidor, el usuario y la
contraseña como cualquier otro ajuste; la integración solo escribe en su volumen `/data` la fecha de
los últimos recordatorios.
