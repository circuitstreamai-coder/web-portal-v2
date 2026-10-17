create or replace function inventory.add_stock(
  p_item_id text,
  p_quantity integer,
  p_user_id text,
  p_remarks text default null
) returns inventory.inventory_items
language plpgsql
security definer
set search_path = inventory, portal, public
as $$
declare
  item inventory.inventory_items;
begin
  if p_quantity <= 0 then raise exception 'Quantity must be greater than 0'; end if;
  select * into item from inventory.inventory_items where id = p_item_id for update;
  if not found then raise exception 'Inventory item not found'; end if;

  update inventory.inventory_items
  set quantity = quantity + p_quantity, updated_at = now()
  where id = p_item_id returning * into item;

  insert into inventory.inventory_transactions (id, item_id, type, quantity, user_id, remarks)
  values (gen_random_uuid()::text, p_item_id, 'IN', p_quantity, p_user_id, p_remarks);
  insert into inventory.inventory_audit_log (id, item_id, action, field, old_value, new_value, changed_by, notes)
  values (gen_random_uuid()::text, p_item_id, 'stock_added', 'quantity',
    (item.quantity - p_quantity)::text, item.quantity::text, p_user_id, p_remarks);
  return item;
end
$$;

create or replace function inventory.use_ticket_item(
  p_ticket_id text,
  p_item_id text,
  p_quantity integer,
  p_user_id text
) returns void
language plpgsql
security definer
set search_path = inventory, ticket, portal, public
as $$
declare
  item inventory.inventory_items;
  assigned_user text;
begin
  if p_quantity <= 0 then raise exception 'Quantity must be greater than 0'; end if;
  select assigned_engineer_id into assigned_user
  from ticket.tickets where id = p_ticket_id and deleted = false;
  if not found then raise exception 'Ticket not found'; end if;
  if assigned_user is distinct from p_user_id then raise exception 'Ticket is not assigned to you'; end if;

  select * into item from inventory.inventory_items where id = p_item_id for update;
  if not found then raise exception 'Inventory item not found'; end if;
  if item.status <> 'available' then raise exception 'Item is not available'; end if;
  if item.quantity < p_quantity then raise exception 'Insufficient stock'; end if;

  update inventory.inventory_items
  set quantity = quantity - p_quantity,
      status = case when quantity - p_quantity = 0 then 'in_use' else status end,
      updated_at = now()
  where id = p_item_id;
  insert into inventory.inventory_transactions (id, item_id, type, quantity, ticket_id, user_id)
  values (gen_random_uuid()::text, p_item_id, 'OUT', p_quantity, p_ticket_id, p_user_id);
  insert into inventory.ticket_inventory (id, ticket_id, item_id, quantity, used_by)
  values (gen_random_uuid()::text, p_ticket_id, p_item_id, p_quantity, p_user_id);
  insert into inventory.inventory_audit_log (id, item_id, action, changed_by, notes)
  values (gen_random_uuid()::text, p_item_id, 'used_on_ticket', p_user_id,
    format('Used %s unit(s) on ticket %s', p_quantity, p_ticket_id));
end
$$;

revoke all on function inventory.add_stock(text, integer, text, text) from public, anon, authenticated;
revoke all on function inventory.use_ticket_item(text, text, integer, text) from public, anon, authenticated;
grant execute on function inventory.add_stock(text, integer, text, text) to service_role;
grant execute on function inventory.use_ticket_item(text, text, integer, text) to service_role;
