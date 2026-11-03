import { config } from 'dotenv';

// Las pruebas corren contra la base de pruebas, nunca contra la de desarrollo.
config({ path: '.env.test', override: true, quiet: true });
