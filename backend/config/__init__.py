# PyMySQL is a pure-Python MySQL driver; it stands in for mysqlclient so the
# backend installs without C build tools.
import pymysql

pymysql.version_info = (2, 2, 7, "final", 0)
pymysql.install_as_MySQLdb()
