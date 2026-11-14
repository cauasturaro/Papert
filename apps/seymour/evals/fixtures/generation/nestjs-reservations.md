# Lantern reservations: NestJS team notes

## Boundary layout

The reservations team keeps application-facing interfaces in `lantern-ports/`. This directory contains TypeScript interfaces and injection tokens only. It must not import NestJS decorators, database clients, or transport request objects. Application use cases receive these ports through constructor injection, while a NestJS module binds each token to an adapter.

The first exercise models a room reservation with a room identifier, a time interval, and an owner identifier. Keep interval validation in the domain model. The controller translates a request into application input and translates the result back into a response. It does not query persistence directly.

## Persistence and events

Name the persistence boundary `ReservationLedgerPort`. Its contract expresses reservation operations rather than database query syntax. An in-memory adapter is enough for the first implementation; a later adapter may use a database without changing the use case.

A successful reservation produces the event `lantern.reservation-recorded.v2`. Construct this event only after persistence succeeds. Keep event construction separate from transport delivery, and pass a publication port into the use case. Do not expose the persistence adapter through the event payload.

## Review evidence

Reviewers inspect separate domain, application, adapter, and module files. They check dependency direction, token bindings, interval validation, and the order of persistence and event construction. Supply test source for overlapping intervals and failed persistence; review can inspect those assertions without running the suite.
