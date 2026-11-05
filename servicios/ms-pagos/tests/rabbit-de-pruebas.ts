/**
 * Las pruebas usan el RabbitMQ de docker compose, pero en su propio virtual
 * host («pruebas»), con su exchange y sus colas.
 *
 * En el mismo virtual host que los servicios levantados, lo que publica una
 * prueba (un InsumoGuardado de un insumo de prueba, un ProductoGuardado...)
 * también lo consumen ms-catalogo y ms-inventario de docker compose, y sus
 * réplicas en las bases de desarrollo terminan con datos de prueba.
 *
 * Se ejecuta como globalSetup de vitest: crea el virtual host y da permisos al
 * usuario por la API de administración (puerto 15672). Si ya existen, no
 * cambia nada. Copiado idéntico en tests/ de cada servicio
 * (servicios/compartido/rabbit-de-pruebas.ts).
 */
const API = 'http://127.0.0.1:15672/api';
const USUARIO = process.env.RABBITMQ_USUARIO ?? 'nutriexpress';
const CLAVE = process.env.RABBITMQ_CLAVE ?? 'nutriexpress';
export const VHOST_DE_PRUEBAS = 'pruebas';

async function poner(ruta: string, cuerpo: object): Promise<void> {
  let r: Response;
  try {
    r = await fetch(`${API}/${ruta}`, {
      method: 'PUT',
      headers: {
        Authorization: `Basic ${Buffer.from(`${USUARIO}:${CLAVE}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error('RabbitMQ no responde en el puerto 15672: levante docker compose antes de las pruebas.');
  }
  if (!r.ok) throw new Error(`RabbitMQ rechazó ${ruta}: ${r.status} ${await r.text()}`);
}

export default async function prepararRabbitDePruebas(): Promise<void> {
  await poner(`vhosts/${VHOST_DE_PRUEBAS}`, {});
  await poner(`permissions/${VHOST_DE_PRUEBAS}/${encodeURIComponent(USUARIO)}`, {
    configure: '.*',
    write: '.*',
    read: '.*',
  });
}
