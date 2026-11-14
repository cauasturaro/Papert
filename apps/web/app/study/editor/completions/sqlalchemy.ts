import type { CatalogItem } from "./types.ts";

export const sqlalchemyCatalog: CatalogItem[] = [
  {
    label: "sqlalchemy-base",
    insertText: `class Base(DeclarativeBase):
    pass`,
    documentation: "SQLAlchemy 2 declarative base.",
    framework: "sqlalchemy",
    imports: ["from sqlalchemy.orm import DeclarativeBase"],
  },
  {
    label: "sqlalchemy-model",
    insertText: `class \${1:Item}(Base):
    __tablename__ = "\${2:items}"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(\${3:200}))`,
    documentation: "Typed SQLAlchemy 2 model.",
    framework: "sqlalchemy",
    imports: [
      "from sqlalchemy import String",
      "from sqlalchemy.orm import Mapped, mapped_column",
    ],
  },
  {
    label: "sqlalchemy-relationship",
    insertText:
      '${1:children}: Mapped[list["${2:Child}"]] = relationship(back_populates="${3:parent}")',
    documentation: "Typed ORM relationship.",
    framework: "sqlalchemy",
    imports: ["from sqlalchemy.orm import Mapped, relationship"],
  },
  {
    label: "sqlalchemy-select",
    insertText: `statement = select(\${1:Item}).where(\${1:Item}.\${2:id} == \${3:item_id})
items = session.scalars(statement).all()`,
    documentation: "SQLAlchemy 2 select and scalar results.",
    framework: "sqlalchemy",
    imports: ["from sqlalchemy import select"],
  },
  {
    label: "sqlalchemy-session",
    insertText: `with Session(\${1:engine}) as session:
    with session.begin():
        session.add(\${2:item})`,
    documentation: "Session with a transaction boundary.",
    framework: "sqlalchemy",
    imports: ["from sqlalchemy.orm import Session"],
  },
];
