// Ammo.js wrapper. Handles the dynamics world and the rigid objects

import * as THREE from 'three';

export class Physics {
  constructor(Ammo) {
    this.Ammo = Ammo;
    const cfg = new Ammo.btDefaultCollisionConfiguration();
    this.dispatcher = new Ammo.btCollisionDispatcher(cfg);
    const broadphase = new Ammo.btDbvtBroadphase();
    const solver = new Ammo.btSequentialImpulseConstraintSolver();
    this.world = new Ammo.btDiscreteDynamicsWorld(this.dispatcher, broadphase, solver, cfg);
    this.world.setGravity(new Ammo.btVector3(0, -9.82, 0));

    this._tmpTrans = new Ammo.btTransform();
    this._tmpQuat = new THREE.Quaternion();
    this.linked = []; 
  }

  _transform(pos, quat) {
    const A = this.Ammo;
    const t = new A.btTransform();
    t.setIdentity();
    t.setOrigin(new A.btVector3(pos.x, pos.y, pos.z));
    const q = quat || new THREE.Quaternion();
    t.setRotation(new A.btQuaternion(q.x, q.y, q.z, q.w));
    return t;
  }

  addBox(half, pos, quat, mass, opts = {}) {
    const A = this.Ammo;
    const shape = new A.btBoxShape(new A.btVector3(half.x, half.y, half.z));
    shape.setMargin(0.04);
    return this._finishBody(shape, pos, quat, mass, opts);
  }

  addCylinder(radius, height, pos, quat, mass, opts = {}) {
    const A = this.Ammo;
    const shape = new A.btCylinderShape(new A.btVector3(radius, height * 0.5, radius));
    shape.setMargin(0.04);
    return this._finishBody(shape, pos, quat, mass, opts);
  }

  _finishBody(shape, pos, quat, mass, opts) {
    const A = this.Ammo;
    const transform = this._transform(pos, quat);
    const motionState = new A.btDefaultMotionState(transform);
    const inertia = new A.btVector3(0, 0, 0);
    if (mass > 0) shape.calculateLocalInertia(mass, inertia);
    const info = new A.btRigidBodyConstructionInfo(mass, motionState, shape, inertia);
    const body = new A.btRigidBody(info);
    body.setFriction(opts.friction ?? 0.9);
    body.setRestitution(opts.restitution ?? 0.05);
    if (mass > 0) {
      body.setDamping(0.15, 0.35);
      body.setActivationState(1);
    }
    this.world.addRigidBody(body);
    if (opts.mesh) {
      opts.mesh.userData.body = body;
      this.linked.push({ mesh: opts.mesh, body });
    }
    return body;
  }

  addPoint2Point(body, pivotLocal) {
    const A = this.Ammo;
    const c = new A.btPoint2PointConstraint(body, new A.btVector3(pivotLocal.x, pivotLocal.y, pivotLocal.z));
    this.world.addConstraint(c, true);
    return c;
  }

  addHinge(staticBody, dynBody, pivotStatic, pivotDyn, axis) {
    const A = this.Ammo;
    const hinge = new A.btHingeConstraint(
      staticBody, dynBody,
      new A.btVector3(pivotStatic.x, pivotStatic.y, pivotStatic.z),
      new A.btVector3(pivotDyn.x, pivotDyn.y, pivotDyn.z),
      new A.btVector3(axis.x, axis.y, axis.z),
      new A.btVector3(axis.x, axis.y, axis.z),
      true
    );
    this.world.addConstraint(hinge, true);
    return hinge;
  }

  getLinearVelocity(body) {
    const v = body.getLinearVelocity();
    return { x: v.x(), y: v.y(), z: v.z() };
  }

  setLinearVelocity(body, x, y, z) {
    if (!this._tmpVel) this._tmpVel = new this.Ammo.btVector3(0, 0, 0);
    this._tmpVel.setValue(x, y, z);
    body.activate();
    body.setLinearVelocity(this._tmpVel);
  }

  applyImpulse(body, imp, rel) {    const A = this.Ammo;
    body.activate();
    body.applyImpulse(
      new A.btVector3(imp.x, imp.y, imp.z),
      new A.btVector3(rel?.x || 0, rel?.y || 0, rel?.z || 0)
    );
  }

  applyTorque(body, t) {
    const A = this.Ammo;
    body.activate();
    body.applyTorqueImpulse(new A.btVector3(t.x, t.y, t.z));
  }

  step(dt) {
    this.world.stepSimulation(dt, 4, 1 / 120);
    const trans = this._tmpTrans;
    for (let i = 0; i < this.linked.length; i++) {
      const { mesh, body } = this.linked[i];
      const ms = body.getMotionState();
      if (!ms) continue;
      ms.getWorldTransform(trans);
      const o = trans.getOrigin();
      const r = trans.getRotation();
      mesh.position.set(o.x(), o.y(), o.z());
      mesh.quaternion.set(r.x(), r.y(), r.z(), r.w());
    }
  }
}